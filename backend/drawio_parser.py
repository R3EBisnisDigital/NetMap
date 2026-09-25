"""Drawio XML -> nodes/edges parser used by the API upload endpoint."""
from __future__ import annotations
import re
import uuid
import xml.etree.ElementTree as ET
from typing import List, Dict, Tuple


SHAPE_TYPE_KEYWORDS = {
    "router": ["router", "cisco_router", "l3_switch"],
    "switch": ["switch", "l2_switch", "aruba", "2530"],
    "server": ["server", "proliant", "dl380", "dl385", "rack.hp", "rack.oracle"],
    "firewall": ["firewall", "asa", "fortinet", "palo_alto"],
    "cloud": ["cloud", "internet"],
    "storage": ["storage", "san", "nas", "disk_array"],
    "workstation": ["pc", "desktop", "workstation", "laptop"],
    "wifi": ["wireless", "wifi", "access_point", "ap_"],
    "phone": ["phone", "ip_phone"],
    "rack": ["rack.f5", "arx_5000"],
}


def _classify(style: str, value: str) -> str:
    s = (style or "").lower()
    v = (value or "").lower()
    for t, kws in SHAPE_TYPE_KEYWORDS.items():
        for kw in kws:
            if kw in s or kw in v:
                return t
    if "shape=mxgraph.rack" in s:
        return "server"
    if "shape=mxgraph.networks" in s or "shape=mxgraph.cisco" in s:
        return "router"
    if "shape=mxgraph.aws" in s or "shape=mxgraph.azure" in s or "shape=mxgraph.gcp" in s:
        return "cloud"
    if s.startswith("text;") or "text;html=1" in s:
        return "label"
    return "generic"


def _norm(nodes: List[dict], target_w: float = 1400, target_h: float = 900, pad: float = 60) -> List[dict]:
    if not nodes:
        return nodes
    xs = [n["x"] for n in nodes] + [n["x"] + n["w"] for n in nodes]
    ys = [n["y"] for n in nodes] + [n["y"] + n["h"] for n in nodes]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = max_x - min_x or 1
    span_y = max_y - min_y or 1
    scale = min((target_w - 2 * pad) / span_x, (target_h - 2 * pad) / span_y)
    for n in nodes:
        n["x"] = round((n["x"] - min_x) * scale + pad, 2)
        n["y"] = round((n["y"] - min_y) * scale + pad, 2)
        n["w"] = round(n["w"] * scale, 2)
        n["h"] = round(n["h"] * scale, 2)
    return nodes


def parse(xml_text: str) -> Tuple[List[dict], List[dict]]:
    """Return (nodes, edges) parsed from a .drawio XML string.

    Handles: nested groups, object wrappers, edges with source/target IDs and
    edges that only have sourcePoint/targetPoint coordinates (falls back to
    nearest node).
    """
    root = ET.fromstring(xml_text)
    model = root.find(".//mxGraphModel/root")
    if model is None:
        model = root.find(".//root")
    if model is None:
        return [], []

    all_cells: List[Tuple[dict, ET.Element]] = []
    for c in model.findall("mxCell"):
        all_cells.append((dict(c.attrib), c.find("mxGeometry")))
    for obj in model.findall("object"):
        mc = obj.find("mxCell")
        if mc is None:
            continue
        merged = dict(mc.attrib)
        merged["value"] = obj.attrib.get("label") or obj.attrib.get("value") or mc.attrib.get("value", "")
        all_cells.append((merged, mc.find("mxGeometry")))

    raw_nodes: Dict[str, dict] = {}
    edges: List[dict] = []

    for attrs, geom in all_cells:
        cid = attrs.get("id")
        if cid in (None, "0", "1"):
            continue
        style = attrs.get("style", "")
        value = attrs.get("value", "") or ""
        value_clean = re.sub(r"<[^>]+>", " ", value).strip()
        value_clean = re.sub(r"\s+", " ", value_clean)
        parent = attrs.get("parent", "1")

        if attrs.get("edge") == "1":
            sx = sy = tx = ty = None
            if geom is not None:
                for pt in geom.findall("mxPoint"):
                    role = pt.attrib.get("as")
                    if role == "sourcePoint":
                        sx = float(pt.attrib.get("x", 0) or 0)
                        sy = float(pt.attrib.get("y", 0) or 0)
                    elif role == "targetPoint":
                        tx = float(pt.attrib.get("x", 0) or 0)
                        ty = float(pt.attrib.get("y", 0) or 0)
            edges.append({
                "id": cid, "source": attrs.get("source"), "target": attrs.get("target"),
                "sx": sx, "sy": sy, "tx": tx, "ty": ty,
                "label": value_clean,
            })
        elif attrs.get("vertex") == "1":
            x, y, w, h = 0.0, 0.0, 40.0, 40.0
            if geom is not None:
                x = float(geom.attrib.get("x", 0) or 0)
                y = float(geom.attrib.get("y", 0) or 0)
                w = float(geom.attrib.get("width", 40) or 40)
                h = float(geom.attrib.get("height", 40) or 40)
            raw_nodes[cid] = {
                "id": cid, "label": value_clean, "x": x, "y": y, "w": w, "h": h,
                "type": _classify(style, value_clean),
                "parent": parent,
            }

    # Resolve absolute coordinates for children of groups
    def abs_pos(node, depth: int = 0):
        if depth > 10:
            return node["x"], node["y"]
        p = raw_nodes.get(node["parent"])
        if p is None:
            return node["x"], node["y"]
        px, py = abs_pos(p, depth + 1)
        return node["x"] + px, node["y"] + py

    for n in raw_nodes.values():
        n["x"], n["y"] = abs_pos(n)

    referenced = set()
    for e in edges:
        if e.get("source"):
            referenced.add(e["source"])
        if e.get("target"):
            referenced.add(e["target"])

    child_map: Dict[str, List[str]] = {}
    for n in raw_nodes.values():
        child_map.setdefault(n["parent"], []).append(n["id"])

    keep: Dict[str, dict] = {}
    for n in raw_nodes.values():
        nid = n["id"]
        is_ref = nid in referenced
        has_label = bool(n["label"]) and n["type"] != "label"
        device_like = n["type"] not in ("generic", "label")
        top_level = n["parent"] == "1"
        is_group = nid in child_map and top_level
        if is_ref or (device_like and top_level) or (has_label and top_level and n["w"] > 20) or is_group:
            keep[nid] = n

    # Inherit type from children when a kept group is generic
    for gid, n in list(keep.items()):
        if n["type"] == "generic" and gid in child_map:
            for cid in child_map[gid]:
                c = raw_nodes.get(cid)
                if c and c["type"] not in ("generic", "label"):
                    n["type"] = c["type"]
                    if not n["label"] and c["label"]:
                        n["label"] = c["label"]
                    break

    final_nodes: List[dict] = []
    for n in keep.values():
        if n["type"] == "label":
            continue
        if n["type"] == "generic" and not n["label"] and (n["w"] < 25 or n["h"] < 25) and n["id"] not in referenced:
            continue
        final_nodes.append({
            "id": n["id"], "label": n["label"], "type": n["type"],
            "x": n["x"], "y": n["y"], "w": n["w"], "h": n["h"],
        })

    node_ids = {n["id"] for n in final_nodes}

    def resolve_ref(cid):
        seen = 0
        while cid and cid not in node_ids and seen < 10:
            parent_node = raw_nodes.get(cid)
            if not parent_node:
                return None
            cid = parent_node["parent"]
            seen += 1
        return cid if cid in node_ids else None

    def nearest(x, y):
        if x is None or y is None or not final_nodes:
            return None
        best = None
        best_d = 1e18
        for n in final_nodes:
            cx = n["x"] + n["w"] / 2
            cy = n["y"] + n["h"] / 2
            d = (cx - x) ** 2 + (cy - y) ** 2
            if d < best_d:
                best_d = d
                best = n["id"]
        return best

    final_edges: List[dict] = []
    for e in edges:
        s = resolve_ref(e["source"]) if e.get("source") else None
        t = resolve_ref(e["target"]) if e.get("target") else None
        if not s and e.get("sx") is not None:
            s = nearest(e["sx"], e["sy"])
        if not t and e.get("tx") is not None:
            t = nearest(e["tx"], e["ty"])
        if s and t and s != t:
            final_edges.append({
                "id": e["id"], "source": s, "target": t, "label": e.get("label", ""),
            })

    _norm(final_nodes)

    # Ensure unique ids (defensive) - avoid clashes with existing maps by regenerating IDs
    id_map = {n["id"]: str(uuid.uuid4()) for n in final_nodes}
    for n in final_nodes:
        n["id"] = id_map[n["id"]]
    remapped_edges = []
    for e in final_edges:
        new_s = id_map.get(e["source"])
        new_t = id_map.get(e["target"])
        if new_s and new_t:
            remapped_edges.append({
                "id": str(uuid.uuid4()), "source": new_s, "target": new_t, "label": e.get("label", ""),
            })
    return final_nodes, remapped_edges
