import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Activity, ZoomIn, ZoomOut, Maximize2, Edit3, Save,
  Plus, Trash2, X, Radio, Loader2, RefreshCw, Link2, MousePointer2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import {
  getMap, updateMap, addNode, updateNode, deleteNode,
  addEdge, deleteEdge, getStatus,
} from "@/lib/api";
import { DeviceIcon, DEVICE_TYPES, typeColor, typeLabel } from "@/lib/deviceIcons";
import TopologyCanvas from "@/components/TopologyCanvas";

function StatusPill({ status }) {
  const s = status || "unknown";
  const colors = {
    up: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    down: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    unknown: "bg-slate-700/40 text-slate-400 border-slate-600/40",
  }[s];
  const label = { up: "Online", warn: "Warning", down: "Offline", unknown: "Unknown" }[s];
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] mono border ${colors}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${s === "up" ? "bg-emerald-400" : s === "warn" ? "bg-amber-400" : s === "down" ? "bg-rose-400" : "bg-slate-500"} status-dot-pulse`} />
    {label}
  </span>;
}

export default function MapViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMap, setStatusMap] = useState({}); // nodeId -> {status, latency}
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [fitTick, setFitTick] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // details form (when editing node)
  const [nodeForm, setNodeForm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMap(id);
      setMap(data);
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load map");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Live status polling
  useEffect(() => {
    if (!map || !autoRefresh) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getStatus(id);
        if (!cancelled) setStatusMap(s.nodes || {});
      } catch (e) { /* ignore polling errors */ }
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [id, map, autoRefresh]);

  const selectedNode = useMemo(
    () => map?.nodes?.find((n) => n.id === selectedId) || null,
    [map, selectedId],
  );

  useEffect(() => {
    if (selectedNode) setNodeForm({ ...selectedNode });
    else setNodeForm(null);
  }, [selectedNode]);

  const stats = useMemo(() => {
    let up = 0, warn = 0, down = 0;
    Object.values(statusMap).forEach((s) => {
      if (s.status === "up") up++; else if (s.status === "warn") warn++; else if (s.status === "down") down++;
    });
    return { up, warn, down };
  }, [statusMap]);

  const handleNodeClick = (node) => {
    if (editMode && linkingFrom) {
      if (linkingFrom === node.id) { setLinkingFrom(null); return; }
      addEdge(id, { source: linkingFrom, target: node.id, label: "" })
        .then(() => { toast({ title: "Link created" }); setLinkingFrom(null); load(); })
        .catch((e) => toast({ title: "Failed to link", description: String(e.message || e) }));
      return;
    }
    setSelectedId(node.id);
  };

  const handleCanvasClick = (pos) => {
    // In edit mode with node type chosen via toolbar drop
    if (editMode && addAtNext) {
      const type = addAtNext;
      addNode(id, {
        label: `New ${type}`,
        type,
        x: pos.x - 30,
        y: pos.y - 30,
        w: 60, h: 60,
      }).then(() => { toast({ title: `Added ${type}` }); setAddAtNext(null); load(); })
        .catch((e) => toast({ title: "Failed to add", description: String(e.message || e) }));
    } else {
      setSelectedId(null);
    }
  };

  const handleNodeDrag = async (nodeId, x, y) => {
    if (!editMode) return;
    // optimistic local update
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    }));
  };

  const persistNodePosition = async (nodeId, x, y) => {
    if (!editMode) return;
    try { await updateNode(id, nodeId, { x, y }); } catch (e) { /* ignore */ }
  };

  const [addAtNext, setAddAtNext] = useState(null);

  const saveNode = async () => {
    if (!nodeForm) return;
    try {
      await updateNode(id, nodeForm.id, {
        label: nodeForm.label, type: nodeForm.type,
        ip: nodeForm.ip, description: nodeForm.description,
      });
      toast({ title: "Device updated" });
      load();
    } catch (e) {
      toast({ title: "Failed to save", description: String(e.message || e) });
    }
  };

  const removeNode = async () => {
    if (!selectedNode) return;
    try {
      await deleteNode(id, selectedNode.id);
      toast({ title: "Device removed" });
      setSelectedId(null);
      load();
    } catch (e) { toast({ title: "Failed to delete", description: String(e.message || e) }); }
  };

  const edgeById = useMemo(() => Object.fromEntries((map?.edges || []).map((e) => [e.id, e])), [map]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="px-6 py-3 border-b border-slate-800/70 flex items-center gap-4 bg-slate-950/80 backdrop-blur">
        <button onClick={() => navigate("/")} className="text-slate-400 hover:text-slate-100 flex items-center gap-1.5">
          <ArrowLeft size={16} /> <span className="text-sm">Maps</span>
        </button>
        <div className="h-6 w-px bg-slate-800" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{map?.name || (loading ? "Loading..." : "Map")}</h1>
          {map?.description ? <p className="text-xs text-slate-500 mono truncate">{map.description}</p> : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-3 mr-2 text-xs mono">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,.6)]"/> {stats.up}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,.5)]"/> {stats.warn}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,.5)]"/> {stats.down}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh((v) => !v)}
                  className="bg-slate-900/60 border-slate-700 text-slate-200 hover:bg-slate-800">
            <Radio size={14} className={`mr-1.5 ${autoRefresh ? "text-emerald-400" : "text-slate-500"}`} />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={load}
                  className="bg-slate-900/60 border-slate-700 text-slate-200 hover:bg-slate-800">
            <RefreshCw size={14} className="mr-1.5" /> Reload
          </Button>
          <Button size="sm" onClick={() => setEditMode((v) => !v)}
                  className={editMode ? "bg-amber-500 hover:bg-amber-400 text-slate-950" : "bg-sky-500 hover:bg-sky-400 text-slate-950"}>
            {editMode ? <><Save size={14} className="mr-1.5"/> Done</> : <><Edit3 size={14} className="mr-1.5"/> Edit</>}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-60 border-r border-slate-800/70 bg-slate-950/80 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800/70">
            <p className="mono text-[10px] uppercase tracking-[0.25em] text-slate-500">Add device</p>
            <p className="text-xs text-slate-400 mt-1">{editMode ? "Click a type, then click the canvas." : "Enable edit mode to add devices."}</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 grid grid-cols-2 gap-2">
              {DEVICE_TYPES.filter((t) => t !== "generic").map((t) => (
                <button
                  key={t}
                  disabled={!editMode}
                  onClick={() => setAddAtNext(t)}
                  className={`group flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all
                    ${!editMode ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                    ${addAtNext === t ? "border-sky-400 bg-sky-500/10" : "border-slate-800 bg-slate-900/40 hover:border-slate-600"}`}
                >
                  <div className="h-8 w-8 rounded-md grid place-items-center" style={{ background: `${typeColor(t)}20`, color: typeColor(t) }}>
                    <DeviceIcon type={t} size={18} />
                  </div>
                  <span className="text-[11px] text-slate-300 capitalize">{t}</span>
                </button>
              ))}
            </div>
            {editMode && (
              <div className="px-3 pb-3">
                <Button size="sm" onClick={() => setLinkingFrom((v) => (v ? null : "__pick__"))}
                        variant="outline"
                        className={`w-full ${linkingFrom ? "border-sky-500 text-sky-300" : "bg-slate-900/50 border-slate-700 text-slate-200"}`}>
                  <Link2 size={14} className="mr-1.5" /> {linkingFrom ? "Cancel link" : "Draw link"}
                </Button>
                <p className="text-[10.5px] text-slate-500 mt-2 leading-relaxed">
                  {linkingFrom === "__pick__"
                    ? "Pick source node..."
                    : linkingFrom
                    ? "Pick target node..."
                    : "Connect two nodes with a link."}
                </p>
              </div>
            )}
          </ScrollArea>
        </aside>

        <main className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 grid place-items-center text-slate-400">
              <div className="flex items-center gap-2"><Loader2 className="animate-spin"/> Loading topology...</div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 grid place-items-center text-rose-400 mono text-sm">{error}</div>
          )}
          {map && (
            <TopologyCanvas
              map={map}
              statusMap={statusMap}
              selectedId={selectedId}
              hoveredId={hoveredId}
              editMode={editMode}
              linkingFrom={linkingFrom && linkingFrom !== "__pick__" ? linkingFrom : null}
              zoom={zoom}
              onZoomChange={setZoom}
              fitTick={fitTick}
              onNodeClick={(n) => {
                if (editMode && linkingFrom === "__pick__") {
                  setLinkingFrom(n.id);
                  return;
                }
                handleNodeClick(n);
              }}
              onNodeHover={(n) => setHoveredId(n ? n.id : null)}
              onCanvasClick={handleCanvasClick}
              onNodeDrag={handleNodeDrag}
              onNodeDragEnd={persistNodePosition}
              addAtNext={addAtNext}
            />
          )}

          {/* Zoom / Fit controls */}
          <div className="absolute right-4 bottom-4 flex flex-col items-end gap-2 z-10">
            <TooltipProvider>
              <div className="panel rounded-lg p-1 flex flex-col shadow-xl">
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} className="h-8 w-8 grid place-items-center text-slate-300 hover:text-sky-300 hover:bg-slate-800/60 rounded"><ZoomIn size={16}/></button>
                </TooltipTrigger><TooltipContent side="left">Zoom in</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))} className="h-8 w-8 grid place-items-center text-slate-300 hover:text-sky-300 hover:bg-slate-800/60 rounded"><ZoomOut size={16}/></button>
                </TooltipTrigger><TooltipContent side="left">Zoom out</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => setFitTick((t) => t + 1)} className="h-8 w-8 grid place-items-center text-slate-300 hover:text-sky-300 hover:bg-slate-800/60 rounded"><Maximize2 size={16}/></button>
                </TooltipTrigger><TooltipContent side="left">Fit to view</TooltipContent></Tooltip>
              </div>
            </TooltipProvider>
            <div className="panel rounded-lg px-2.5 py-1 mono text-[11px] text-slate-400">{Math.round(zoom * 100)}%</div>
          </div>

          {/* Hover tooltip */}
          {hoveredId && !selectedId && map && (() => {
            const n = map.nodes.find((x) => x.id === hoveredId);
            if (!n) return null;
            const s = statusMap[n.id];
            return (
              <div className="pointer-events-none absolute left-4 bottom-4 panel rounded-lg px-3 py-2 z-10 max-w-xs">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded grid place-items-center" style={{ background: `${typeColor(n.type)}25`, color: typeColor(n.type) }}>
                    <DeviceIcon type={n.type} size={14}/>
                  </div>
                  <div className="min-w-0">
                    <div className="text-slate-100 text-sm truncate">{n.label || typeLabel(n.type)}</div>
                    <div className="mono text-[10px] text-slate-500 truncate">{n.ip || typeLabel(n.type)}</div>
                  </div>
                  <StatusPill status={s?.status} />
                </div>
                {s?.latency != null && <div className="mono text-[10.5px] text-slate-500 mt-1">latency {s.latency} ms</div>}
              </div>
            );
          })()}

          {/* Legend */}
          <div className="absolute left-4 top-4 panel rounded-lg px-3 py-2 z-10">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Status</div>
            <div className="flex items-center gap-3 mono text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/> up</span>
              <span className="flex items-center gap-1.5 text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-400"/> warn</span>
              <span className="flex items-center gap-1.5 text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-400"/> down</span>
            </div>
          </div>

          {editMode && addAtNext && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 panel rounded-full px-3 py-1.5 z-10 flex items-center gap-2 mono text-[11px] text-slate-200">
              <MousePointer2 size={12} className="text-sky-400"/> Click on canvas to place a <b className="capitalize">{addAtNext}</b>
              <button onClick={() => setAddAtNext(null)} className="text-slate-500 hover:text-slate-200 ml-1"><X size={12}/></button>
            </div>
          )}
        </main>

        {/* Right: details drawer */}
        <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
          <SheetContent side="right" className="bg-slate-950 border-slate-800 text-slate-100 w-[380px] sm:max-w-[420px] p-0">
            {selectedNode && nodeForm && (
              <div className="h-full flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-lg grid place-items-center" style={{ background: `${typeColor(selectedNode.type)}22`, color: typeColor(selectedNode.type) }}>
                      <DeviceIcon type={selectedNode.type} size={22}/>
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="text-slate-100 truncate">{selectedNode.label || typeLabel(selectedNode.type)}</SheetTitle>
                      <SheetDescription className="mono text-[11px] text-slate-500 truncate">
                        {typeLabel(selectedNode.type)}
                      </SheetDescription>
                    </div>
                    <div className="ml-auto"><StatusPill status={statusMap[selectedNode.id]?.status}/></div>
                  </div>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  <div className="p-5 space-y-5">
                    {/* Live metrics */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-slate-800 p-3">
                        <div className="mono text-[10px] uppercase text-slate-500 tracking-wider">Latency</div>
                        <div className="mono text-xl mt-1">{statusMap[selectedNode.id]?.latency ?? "—"}<span className="text-slate-500 text-xs ml-1">ms</span></div>
                      </div>
                      <div className="rounded-lg border border-slate-800 p-3">
                        <div className="mono text-[10px] uppercase text-slate-500 tracking-wider">Uptime</div>
                        <div className="mono text-xl mt-1">{statusMap[selectedNode.id]?.uptime ?? "—"}<span className="text-slate-500 text-xs ml-1">%</span></div>
                      </div>
                      <div className="rounded-lg border border-slate-800 p-3">
                        <div className="mono text-[10px] uppercase text-slate-500 tracking-wider">Loss</div>
                        <div className="mono text-xl mt-1">{statusMap[selectedNode.id]?.loss ?? "—"}<span className="text-slate-500 text-xs ml-1">%</span></div>
                      </div>
                    </div>
                    <Separator className="bg-slate-800"/>
                    {/* Editable form */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-slate-300">Label</Label>
                        <Input value={nodeForm.label || ""} onChange={(e) => setNodeForm({ ...nodeForm, label: e.target.value })}
                               className="bg-slate-900 border-slate-700 mt-1" />
                      </div>
                      <div>
                        <Label className="text-slate-300">Type</Label>
                        <Select value={nodeForm.type} onValueChange={(v) => setNodeForm({ ...nodeForm, type: v })}>
                          <SelectTrigger className="bg-slate-900 border-slate-700 mt-1"><SelectValue/></SelectTrigger>
                          <SelectContent className="bg-slate-950 border-slate-800 text-slate-100">
                            {DEVICE_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="capitalize focus:bg-slate-900">
                                <div className="flex items-center gap-2">
                                  <DeviceIcon type={t} size={14} className="" />
                                  <span className="capitalize">{t}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-300">IP / Address</Label>
                        <Input value={nodeForm.ip || ""} onChange={(e) => setNodeForm({ ...nodeForm, ip: e.target.value })}
                               placeholder="10.0.0.1" className="bg-slate-900 border-slate-700 mono mt-1" />
                      </div>
                      <div>
                        <Label className="text-slate-300">Description</Label>
                        <Textarea value={nodeForm.description || ""} onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })}
                                  placeholder="Notes about this device" className="bg-slate-900 border-slate-700 mt-1" rows={4} />
                      </div>
                    </div>
                    {/* Connected links */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="mono text-[10px] uppercase text-slate-500 tracking-wider">Connected links</div>
                      </div>
                      <div className="space-y-1.5">
                        {(map.edges || [])
                          .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                          .map((e) => {
                            const otherId = e.source === selectedNode.id ? e.target : e.source;
                            const other = map.nodes.find((n) => n.id === otherId);
                            return (
                              <div key={e.id} className="flex items-center gap-2 text-xs bg-slate-900/50 border border-slate-800 rounded px-2 py-1.5">
                                <Activity size={12} className="text-sky-400"/>
                                <span className="truncate flex-1">{other?.label || typeLabel(other?.type || "generic")}</span>
                                {editMode && (
                                  <button className="text-slate-500 hover:text-rose-400" onClick={async () => {
                                    await deleteEdge(id, e.id); load();
                                  }}><Trash2 size={12}/></button>
                                )}
                              </div>
                            );
                          })}
                        {(map.edges || []).filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length === 0 && (
                          <div className="text-[11px] text-slate-500 mono">No links.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
                <div className="border-t border-slate-800 p-4 flex items-center gap-2">
                  <Button variant="outline" onClick={removeNode} className="bg-slate-900 border-slate-700 text-rose-300 hover:bg-rose-900/40 hover:text-rose-200">
                    <Trash2 size={14} className="mr-1.5"/> Delete
                  </Button>
                  <div className="ml-auto flex gap-2">
                    <Button variant="ghost" onClick={() => setSelectedId(null)} className="text-slate-400">Close</Button>
                    <Button onClick={saveNode} className="bg-sky-500 hover:bg-sky-400 text-slate-950">
                      <Save size={14} className="mr-1.5"/> Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
