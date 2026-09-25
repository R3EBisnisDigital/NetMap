from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pathlib import Path
from typing import List, Optional, Dict, Any
import os
import uuid
import json
import random
import time
import logging
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "netmap")]

app = FastAPI(title="NetMap API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("netmap")


# ------------------------------ Models ------------------------------
class NodeIn(BaseModel):
    id: Optional[str] = None
    label: str = ""
    type: str = "generic"
    x: float = 0
    y: float = 0
    w: float = 60
    h: float = 60
    ip: Optional[str] = None
    description: Optional[str] = None

class NodePatch(BaseModel):
    label: Optional[str] = None
    type: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None
    ip: Optional[str] = None
    description: Optional[str] = None

class EdgeIn(BaseModel):
    id: Optional[str] = None
    source: str
    target: str
    label: Optional[str] = ""

class MapCreate(BaseModel):
    name: str
    description: Optional[str] = ""

class MapUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


def _now():
    return datetime.now(timezone.utc).isoformat()


def _clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def _summary(doc: dict) -> dict:
    nodes = doc.get("nodes", []) or []
    edges = doc.get("edges", []) or []
    # deterministic pseudo-status for card preview based on node id
    up = warn = down = 0
    counter = {}
    for n in nodes:
        counter[n.get("type", "generic")] = counter.get(n.get("type", "generic"), 0) + 1
        s = _pseudo_status(doc["id"], n["id"])["status"]
        if s == "up":
            up += 1
        elif s == "warn":
            warn += 1
        elif s == "down":
            down += 1
    type_summary = sorted(
        [{"type": t, "count": c} for t, c in counter.items()],
        key=lambda x: -x["count"],
    )
    return {
        "id": doc["id"],
        "name": doc.get("name", ""),
        "description": doc.get("description", ""),
        "nodes": nodes,
        "edges": edges,
        "createdAt": doc.get("createdAt"),
        "updatedAt": doc.get("updatedAt"),
        "stats": {"up": up, "warn": warn, "down": down},
        "typeSummary": type_summary,
    }


def _pseudo_status(map_id: str, node_id: str) -> dict:
    """Deterministic + slowly changing simulated status.
    Uses time bucket so status "drifts" every ~20s but is deterministic per node.
    """
    bucket = int(time.time() // 20)
    seed = hash((map_id, node_id, bucket)) & 0xFFFFFFFF
    rnd = random.Random(seed)
    roll = rnd.random()
    # 82% up, 12% warn, 6% down
    if roll < 0.82:
        status = "up"
    elif roll < 0.94:
        status = "warn"
    else:
        status = "down"
    latency = round(rnd.uniform(4, 40) if status == "up" else rnd.uniform(60, 220) if status == "warn" else rnd.uniform(300, 900), 1)
    loss = 0.0 if status == "up" else round(rnd.uniform(1, 5), 1) if status == "warn" else round(rnd.uniform(15, 100), 1)
    uptime_base = hash((map_id, node_id)) & 0xFF
    uptime = round(97 + (uptime_base % 30) / 10, 1) if status != "down" else round(80 + (uptime_base % 100) / 10, 1)
    return {"status": status, "latency": latency, "loss": loss, "uptime": uptime}


# ------------------------------ Seed ------------------------------
async def seed_if_empty():
    count = await db.maps.count_documents({})
    if count > 0:
        return
    seed_path = ROOT_DIR / "data" / "maps.json"
    if not seed_path.exists():
        logger.warning("No seed file at %s", seed_path)
        return
    data = json.loads(seed_path.read_text())
    for m in data:
        doc = {
            "id": str(uuid.uuid4()),
            "name": m["name"],
            "description": m.get("description", ""),
            "nodes": [
                {
                    "id": n.get("id") or str(uuid.uuid4()),
                    "label": n.get("label", ""),
                    "type": n.get("type", "generic"),
                    "x": n.get("x", 0), "y": n.get("y", 0),
                    "w": n.get("w", 60), "h": n.get("h", 60),
                    "ip": n.get("ip"),
                    "description": n.get("description"),
                }
                for n in m.get("nodes", [])
            ],
            "edges": [
                {
                    "id": e.get("id") or str(uuid.uuid4()),
                    "source": e["source"], "target": e["target"],
                    "label": e.get("label", ""),
                }
                for e in m.get("edges", [])
            ],
            "createdAt": _now(), "updatedAt": _now(),
        }
        await db.maps.insert_one(doc)
    logger.info("Seeded %d maps", len(data))


@app.on_event("startup")
async def on_startup():
    try:
        await seed_if_empty()
    except Exception as e:
        logger.exception("Seed failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ------------------------------ Routes ------------------------------
@api.get("/")
async def root():
    return {"service": "NetMap API", "status": "ok"}


@api.get("/maps")
async def list_maps():
    docs = await db.maps.find({}, {"_id": 0}).sort("createdAt", 1).to_list(500)
    return [_summary(d) for d in docs]


@api.get("/maps/{map_id}")
async def get_map(map_id: str):
    doc = await db.maps.find_one({"id": map_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Map not found")
    return _summary(doc)


@api.post("/maps")
async def create_map(payload: MapCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "description": payload.description or "",
        "nodes": [], "edges": [],
        "createdAt": _now(), "updatedAt": _now(),
    }
    await db.maps.insert_one(doc)
    return _summary(_clean(doc))


@api.put("/maps/{map_id}")
async def update_map(map_id: str, payload: MapUpdate):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    updates["updatedAt"] = _now()
    r = await db.maps.update_one({"id": map_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Map not found")
    doc = await db.maps.find_one({"id": map_id}, {"_id": 0})
    return _summary(doc)


@api.delete("/maps/{map_id}")
async def delete_map(map_id: str):
    r = await db.maps.delete_one({"id": map_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Map not found")
    return {"ok": True}


@api.post("/maps/{map_id}/nodes")
async def add_node(map_id: str, payload: NodeIn):
    doc = await db.maps.find_one({"id": map_id})
    if not doc:
        raise HTTPException(404, "Map not found")
    node = payload.dict()
    node["id"] = node.get("id") or str(uuid.uuid4())
    await db.maps.update_one(
        {"id": map_id},
        {"$push": {"nodes": node}, "$set": {"updatedAt": _now()}},
    )
    return node


@api.put("/maps/{map_id}/nodes/{node_id}")
async def patch_node(map_id: str, node_id: str, payload: NodePatch):
    updates = {f"nodes.$.{k}": v for k, v in payload.dict().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    r = await db.maps.update_one(
        {"id": map_id, "nodes.id": node_id},
        {"$set": {**updates, "updatedAt": _now()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Node not found")
    doc = await db.maps.find_one({"id": map_id}, {"_id": 0})
    node = next((n for n in doc["nodes"] if n["id"] == node_id), None)
    return node


@api.delete("/maps/{map_id}/nodes/{node_id}")
async def delete_node(map_id: str, node_id: str):
    r = await db.maps.update_one(
        {"id": map_id},
        {
            "$pull": {
                "nodes": {"id": node_id},
                "edges": {"$or": [{"source": node_id}, {"target": node_id}]},
            },
            "$set": {"updatedAt": _now()},
        },
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Map not found")
    return {"ok": True}


@api.post("/maps/{map_id}/edges")
async def add_edge(map_id: str, payload: EdgeIn):
    doc = await db.maps.find_one({"id": map_id})
    if not doc:
        raise HTTPException(404, "Map not found")
    edge = payload.dict()
    edge["id"] = edge.get("id") or str(uuid.uuid4())
    edge["label"] = edge.get("label") or ""
    await db.maps.update_one(
        {"id": map_id},
        {"$push": {"edges": edge}, "$set": {"updatedAt": _now()}},
    )
    return edge


@api.delete("/maps/{map_id}/edges/{edge_id}")
async def delete_edge(map_id: str, edge_id: str):
    r = await db.maps.update_one(
        {"id": map_id},
        {"$pull": {"edges": {"id": edge_id}}, "$set": {"updatedAt": _now()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Map not found")
    return {"ok": True}


@api.get("/maps/{map_id}/status")
async def get_status(map_id: str):
    doc = await db.maps.find_one({"id": map_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Map not found")
    result: Dict[str, Any] = {}
    for n in doc.get("nodes", []):
        result[n["id"]] = _pseudo_status(map_id, n["id"])
    return {"mapId": map_id, "nodes": result, "at": _now()}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
