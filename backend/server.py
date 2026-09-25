from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from pathlib import Path
from typing import Optional, Dict, Any, List
import os
import uuid
import json
import random
import time
import logging
import jwt as pyjwt
from datetime import datetime, timezone, timedelta

from drawio_parser import parse as parse_drawio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "netmap")]

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
JWT_SECRET = os.environ.get("JWT_SECRET", "netmap-dev-secret-please-change")
JWT_ALGO = "HS256"
JWT_EXPIRE_HOURS = 24 * 7

app = FastAPI(title="NetMap API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("netmap")


# ------------------------------ Models ------------------------------
class LoginPayload(BaseModel):
    username: str
    password: str

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


def _pseudo_status(map_id: str, node_id: str) -> dict:
    bucket = int(time.time() // 20)
    seed = hash((map_id, node_id, bucket)) & 0xFFFFFFFF
    rnd = random.Random(seed)
    roll = rnd.random()
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


def _summary(doc: dict) -> dict:
    nodes = doc.get("nodes", []) or []
    edges = doc.get("edges", []) or []
    up = warn = down = 0
    counter: Dict[str, int] = {}
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


# ------------------------------ Auth ------------------------------
def _issue_token(username: str) -> str:
    payload = {
        "sub": username,
        "role": "admin",
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRE_HOURS * 3600,
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def require_admin(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Admin login required")
    token = authorization.split(" ", 1)[1]
    try:
        data = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")
    if data.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return data


@api.post("/auth/login")
async def login(payload: LoginPayload):
    if payload.username != ADMIN_USERNAME or payload.password != ADMIN_PASSWORD:
        raise HTTPException(401, "Invalid credentials")
    token = _issue_token(payload.username)
    return {"token": token, "user": {"username": payload.username, "role": "admin"}}


@api.get("/auth/me")
async def me(admin=Depends(require_admin)):
    return {"user": {"username": admin.get("sub"), "role": admin.get("role")}}


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


# ------------------------------ Public routes ------------------------------
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


@api.get("/maps/{map_id}/status")
async def get_status(map_id: str):
    doc = await db.maps.find_one({"id": map_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Map not found")
    result: Dict[str, Any] = {}
    for n in doc.get("nodes", []):
        result[n["id"]] = _pseudo_status(map_id, n["id"])
    return {"mapId": map_id, "nodes": result, "at": _now()}


# ------------------------------ Admin-only routes ------------------------------
@api.post("/maps", dependencies=[Depends(require_admin)])
async def create_map(payload: MapCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name,
        "description": payload.description or "",
        "nodes": [], "edges": [],
        "createdAt": _now(), "updatedAt": _now(),
    }
    await db.maps.insert_one(doc)
    doc.pop("_id", None)
    return _summary(doc)


@api.post("/maps/upload", dependencies=[Depends(require_admin)])
async def upload_drawio(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(""),
):
    if not file.filename.lower().endswith((".drawio", ".xml")):
        raise HTTPException(400, "Only .drawio / .xml files are supported")
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    try:
        text = content.decode("utf-8", errors="ignore")
        nodes, edges = parse_drawio(text)
    except Exception as e:
        logger.exception("Failed to parse drawio: %s", e)
        raise HTTPException(400, f"Invalid drawio file: {e}")
    if not nodes:
        raise HTTPException(400, "No nodes could be extracted from the file")

    display_name = (name or "").strip() or Path(file.filename).stem
    doc = {
        "id": str(uuid.uuid4()),
        "name": display_name,
        "description": description or "",
        "nodes": nodes,
        "edges": edges,
        "createdAt": _now(), "updatedAt": _now(),
    }
    await db.maps.insert_one(doc)
    doc.pop("_id", None)
    return _summary(doc)


@api.put("/maps/{map_id}", dependencies=[Depends(require_admin)])
async def update_map(map_id: str, payload: MapUpdate):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    updates["updatedAt"] = _now()
    r = await db.maps.update_one({"id": map_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Map not found")
    doc = await db.maps.find_one({"id": map_id}, {"_id": 0})
    return _summary(doc)


@api.delete("/maps/{map_id}", dependencies=[Depends(require_admin)])
async def delete_map(map_id: str):
    r = await db.maps.delete_one({"id": map_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Map not found")
    return {"ok": True}


@api.post("/maps/{map_id}/nodes", dependencies=[Depends(require_admin)])
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


@api.put("/maps/{map_id}/nodes/{node_id}", dependencies=[Depends(require_admin)])
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


@api.delete("/maps/{map_id}/nodes/{node_id}", dependencies=[Depends(require_admin)])
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


@api.post("/maps/{map_id}/edges", dependencies=[Depends(require_admin)])
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


@api.delete("/maps/{map_id}/edges/{edge_id}", dependencies=[Depends(require_admin)])
async def delete_edge(map_id: str, edge_id: str):
    r = await db.maps.update_one(
        {"id": map_id},
        {"$pull": {"edges": {"id": edge_id}}, "$set": {"updatedAt": _now()}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Map not found")
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
