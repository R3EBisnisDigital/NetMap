# Contracts

## Backend endpoints (`/api` prefix)
- `GET /maps` list maps (summary incl. nodes/edges + stats + typeSummary)
- `GET /maps/{id}` get single map with full nodes/edges + stats
- `POST /maps` create `{name, description}`
- `PUT /maps/{id}` partial update `{name?, description?}`
- `DELETE /maps/{id}` delete map
- `POST /maps/{id}/nodes` add node `{label, type, x, y, w, h, ip?, description?}`
- `PUT /maps/{id}/nodes/{nodeId}` patch node
- `DELETE /maps/{id}/nodes/{nodeId}` remove node (also removes attached edges)
- `POST /maps/{id}/edges` add edge `{source, target, label?}`
- `DELETE /maps/{id}/edges/{edgeId}` remove edge
- `GET /maps/{id}/status` returns `{ mapId, nodes: { [nodeId]: { status, latency, loss, uptime } }, at }`

## Data model
`maps` collection: `{ id, name, description, nodes: [...], edges: [...], createdAt, updatedAt }`
Node: `{ id, label, type, x, y, w, h, ip?, description? }`
Edge: `{ id, source, target, label }`

## Simulation
Status is computed deterministically per node id per 20-second time bucket. 82% up / 12% warn / 6% down with corresponding latency/loss/uptime ranges. This gives “live” changes without external pings.

## Seeding
On startup, if `maps` collection is empty, backend loads `backend/data/maps.json` (parsed from the 3 supplied `.drawio` files) and inserts them as 3 initial maps.

## Frontend integration
- `frontend/src/lib/api.js` axios client uses `REACT_APP_BACKEND_URL + /api`.
- `MapsListPage` calls `listMaps`, `createMap`, `deleteMap`.
- `MapViewPage` calls `getMap`, `updateNode`, `deleteNode`, `addNode`, `addEdge`, `deleteEdge`, and polls `getStatus` every 4s.
- No mock module is used at runtime; the frontend uses live API only.
