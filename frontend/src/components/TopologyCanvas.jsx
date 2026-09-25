import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DEVICE_META, typeColor } from "@/lib/deviceIcons";
import { useTheme } from "@/theme/ThemeProvider";
import {
  Server, Router, Network, Cloud, Database, ShieldAlert, Wifi, Phone, Monitor, HardDrive, Boxes,
} from "lucide-react";

const SVG_ICONS = {
  router: Router, switch: Network, server: Server, firewall: ShieldAlert,
  cloud: Cloud, storage: Database, workstation: Monitor, wifi: Wifi,
  phone: Phone, rack: HardDrive, generic: Boxes,
};

function statusColor(s) {
  if (s === "up") return "#34d399";
  if (s === "warn") return "#fbbf24";
  if (s === "down") return "#f43f5e";
  return "#64748b";
}

// Compute bounding box of nodes
function bbox(nodes) {
  if (!nodes || !nodes.length) return { minX: 0, minY: 0, maxX: 1000, maxY: 700 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + (n.w || 40));
    maxY = Math.max(maxY, n.y + (n.h || 40));
  });
  return { minX, minY, maxX, maxY };
}

export default function TopologyCanvas({
  map, statusMap, selectedId, hoveredId, editMode, linkingFrom,
  zoom, onZoomChange, fitTick,
  onNodeClick, onNodeHover, onCanvasClick, onNodeDrag, onNodeDragEnd,
  addAtNext,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const { theme } = useTheme();
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null); // { kind: 'pan'|'node', ... }
  const nodes = map?.nodes || [];
  const edges = map?.edges || [];
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  // Resize observer
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // Fit to view
  const fit = useCallback(() => {
    const b = bbox(nodes);
    const w = b.maxX - b.minX + 120;
    const h = b.maxY - b.minY + 120;
    const z = Math.min(size.w / w, size.h / h, 2);
    onZoomChange(z);
    setPan({
      x: (size.w - (b.maxX + b.minX) * z) / 2,
      y: (size.h - (b.maxY + b.minY) * z) / 2,
    });
  }, [nodes, size.w, size.h, onZoomChange]);

  useEffect(() => {
    if (size.w > 0 && nodes.length) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, map?.id]);

  useEffect(() => { if (fitTick > 0) fit(); /* eslint-disable-next-line */ }, [fitTick]);

  // Screen -> world coords
  const screenToWorld = (sx, sy) => {
    const rect = svgRef.current.getBoundingClientRect();
    const localX = sx - rect.left;
    const localY = sy - rect.top;
    return { x: (localX - pan.x) / zoom, y: (localY - pan.y) / zoom };
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const target = e.target;
    const nodeEl = target.closest("[data-node-id]");
    if (editMode && nodeEl && !linkingFrom) {
      const id = nodeEl.getAttribute("data-node-id");
      const n = nodeById[id];
      if (n) {
        const world = screenToWorld(e.clientX, e.clientY);
        setDrag({ kind: "node", id, offX: world.x - n.x, offY: world.y - n.y, moved: false });
        e.preventDefault();
        return;
      }
    }
    setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false });
  };

  const onMouseMove = (e) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      setPan({ x: drag.panX + dx, y: drag.panY + dy });
    } else if (drag.kind === "node") {
      const world = screenToWorld(e.clientX, e.clientY);
      const nx = world.x - drag.offX;
      const ny = world.y - drag.offY;
      drag.moved = true;
      onNodeDrag && onNodeDrag(drag.id, nx, ny);
    }
  };

  const onMouseUp = (e) => {
    if (!drag) return;
    if (drag.kind === "node" && drag.moved) {
      const n = nodeById[drag.id];
      onNodeDragEnd && onNodeDragEnd(drag.id, n.x, n.y);
    } else if (drag.kind === "pan" && !drag.moved) {
      // Treat as canvas click
      const world = screenToWorld(e.clientX, e.clientY);
      onCanvasClick && onCanvasClick(world);
    }
    setDrag(null);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const worldX = (cx - pan.x) / zoom;
    const worldY = (cy - pan.y) / zoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(4, Math.max(0.2, zoom * factor));
    onZoomChange(newZoom);
    setPan({ x: cx - worldX * newZoom, y: cy - worldY * newZoom });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => onWheel(e);
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // eslint-disable-next-line
  }, [zoom, pan.x, pan.y, size.w, size.h]);

  // Grid background rendered via CSS on container. Compute edge paths.
  const renderEdge = (e) => {
    const s = nodeById[e.source];
    const t = nodeById[e.target];
    if (!s || !t) return null;
    const sx = s.x + (s.w || 40) / 2;
    const sy = s.y + (s.h || 40) / 2;
    const tx = t.x + (t.w || 40) / 2;
    const ty = t.y + (t.h || 40) / 2;
    const s1 = statusMap[s.id]?.status;
    const s2 = statusMap[t.id]?.status;
    // if either endpoint is down => red, warn => amber, else sky
    let color = theme === "light" ? "#0369a1" : "#38bdf8";
    if (s1 === "down" || s2 === "down") color = theme === "light" ? "#be123c" : "#f43f5e";
    else if (s1 === "warn" || s2 === "warn") color = theme === "light" ? "#b45309" : "#fbbf24";
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const highlighted = selectedId && (selectedId === s.id || selectedId === t.id);
    return (
      <g key={e.id} opacity={highlighted ? 1 : 0.75}>
        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={color} strokeWidth={highlighted ? 2.4 : 1.6} strokeLinecap="round" />
        <line x1={sx} y1={sy} x2={tx} y2={ty} stroke={color} strokeWidth={0.8} strokeDasharray="6 6" strokeLinecap="round"
              className="edge-flow" opacity={0.9} />
        {e.label ? (
          <g transform={`translate(${midX}, ${midY})`}>
            <rect x="-18" y="-8" width="36" height="16" rx="3" fill="hsl(var(--nm-panel-bg))" stroke="hsl(var(--primary) / 0.35)" />
            <text textAnchor="middle" dy="3.5" className="mono" fontSize="9" fill="hsl(var(--nm-text-muted))">{e.label.slice(0, 8)}</text>
          </g>
        ) : null}
      </g>
    );
  };

  return (
    <div ref={containerRef} className="absolute inset-0 grid-bg-fine noise canvas-vignette overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full select-none"
        style={{ cursor: drag?.kind === "pan" ? "grabbing" : editMode && addAtNext ? "crosshair" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => setDrag(null)}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* edges */}
          <g>{edges.map(renderEdge)}</g>

          {/* linking preview line (from source to mouse) via CSS crosshair only for now */}

          {/* nodes */}
          <g>
            {nodes.map((n) => {
              const cx = n.x + (n.w || 40) / 2;
              const cy = n.y + (n.h || 40) / 2;
              const st = statusMap[n.id]?.status;
              const color = typeColor(n.type, theme);
              const stColor = statusColor(st);
              const isSel = selectedId === n.id;
              const isHov = hoveredId === n.id;
              const isLinkSrc = linkingFrom === n.id;
              const r = 22;
              const Icon = SVG_ICONS[n.type] || SVG_ICONS.generic;
              return (
                <g
                  key={n.id}
                  data-node-id={n.id}
                  className="node-group"
                  transform={`translate(${cx}, ${cy})`}
                  onMouseEnter={() => onNodeHover && onNodeHover(n)}
                  onMouseLeave={() => onNodeHover && onNodeHover(null)}
                  onClick={(e) => { e.stopPropagation(); onNodeClick && onNodeClick(n); }}
                >
                  {/* halo */}
                  <circle className="node-halo" r={r + 8} fill={color} opacity={isSel || isHov ? (theme === "light" ? 0.18 : 0.22) : 0.0}
                          style={{ transition: "opacity 150ms" }} />
                  {/* body */}
                  <circle r={r} fill={theme === "light" ? "#ffffff" : "hsl(var(--nm-panel-bg))"} stroke={color} strokeWidth={isSel ? 2.4 : 1.5} />
                  <circle r={r - 3} fill={`${color}${theme === "light" ? "14" : "18"}`} />
                  {/* status ring */}
                  <circle r={r + 3} fill="none" stroke={stColor} strokeWidth={2}
                          strokeDasharray={st === "up" ? "0" : st === "warn" ? "6 4" : st === "down" ? "3 3" : "2 6"}
                          opacity={0.85} />
                  {/* icon via foreignObject for lucide */}
                  <foreignObject x={-11} y={-11} width={22} height={22} style={{ pointerEvents: "none" }}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{ display: "flex", alignItems: "center", justifyContent: "center", color, width: 22, height: 22 }}>
                      <Icon size={18} strokeWidth={1.75} />
                    </div>
                  </foreignObject>
                  {/* label below */}
                  {(n.label || n.ip) && (
                    <g transform="translate(0, 32)">
                      <text textAnchor="middle" fontSize="10" fill="hsl(var(--nm-text-strong))" className="mono" style={{ paintOrder: "stroke", stroke: "hsl(var(--nm-app-bg))", strokeWidth: 3 }}>
                        {(n.label || n.ip || "").slice(0, 24)}
                      </text>
                      {n.ip && n.label && (
                        <text y={11} textAnchor="middle" fontSize="8.5" fill="hsl(var(--nm-text-muted))" className="mono" style={{ paintOrder: "stroke", stroke: "hsl(var(--nm-app-bg))", strokeWidth: 3 }}>
                          {n.ip}
                        </text>
                      )}
                    </g>
                  )}
                  {/* selection ants */}
                  {isSel && (
                    <circle r={r + 6} fill="none" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="4 4" className="selected-ants" opacity={0.85} />
                  )}
                  {/* linking source ring */}
                  {isLinkSrc && (
                    <circle r={r + 10} fill="none" stroke="#eab308" strokeWidth={1.5} strokeDasharray="2 3" className="selected-ants" />
                  )}
                  {/* status dot */}
                  <circle cx={r - 4} cy={-r + 4} r={4} fill={stColor} stroke="hsl(var(--nm-app-bg))" strokeWidth={1.5} />
                </g>
              );
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
