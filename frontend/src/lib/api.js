import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  timeout: 15000,
});

export const listMaps = () => api.get("/maps").then((r) => r.data);
export const getMap = (id) => api.get(`/maps/${id}`).then((r) => r.data);
export const createMap = (payload) => api.post("/maps", payload).then((r) => r.data);
export const updateMap = (id, payload) => api.put(`/maps/${id}`, payload).then((r) => r.data);
export const deleteMap = (id) => api.delete(`/maps/${id}`).then((r) => r.data);

export const addNode = (mapId, payload) =>
  api.post(`/maps/${mapId}/nodes`, payload).then((r) => r.data);
export const updateNode = (mapId, nodeId, payload) =>
  api.put(`/maps/${mapId}/nodes/${nodeId}`, payload).then((r) => r.data);
export const deleteNode = (mapId, nodeId) =>
  api.delete(`/maps/${mapId}/nodes/${nodeId}`).then((r) => r.data);

export const addEdge = (mapId, payload) =>
  api.post(`/maps/${mapId}/edges`, payload).then((r) => r.data);
export const deleteEdge = (mapId, edgeId) =>
  api.delete(`/maps/${mapId}/edges/${edgeId}`).then((r) => r.data);

export const getStatus = (mapId) =>
  api.get(`/maps/${mapId}/status`).then((r) => r.data);
