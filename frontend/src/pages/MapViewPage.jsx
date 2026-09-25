import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Activity, ZoomIn, ZoomOut, Maximize2, Edit3, Save,
  Trash2, X, Radio, Loader2, RefreshCw, Link2, MousePointer2,
  Lock, LogIn, EyeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  getMap, updateNode, deleteNode, addNode, addEdge, deleteEdge, getStatus,
} from "@/lib/api";
import { DeviceIcon, DEVICE_TYPES, typeColor, typeLabel } from "@/lib/deviceIcons";
import TopologyCanvas from "@/components/TopologyCanvas";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/auth/AuthProvider";

function StatusPill({ status }) {
  const s = status || "unknown";
  const colors = {
    up: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
    warn: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
    down: "bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30",
    unknown: "bg-slate-500/15 text-[hsl(var(--nm-text-muted))] border-[hsl(var(--nm-panel-border))]",
  }[s];
  const label = { up: "Online", warn: "Warning", down: "Offline", unknown: "Unknown" }[s];
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] mono border ${colors}`}>
    <span className={`h-1.5 w-1.5 rounded-full ${s === "up" ? "bg-emerald-500" : s === "warn" ? "bg-amber-500" : s === "down" ? "bg-rose-500" : "bg-slate-400"} status-dot-pulse`} />
    {label}
  </span>;
}

export default function MapViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMap, setStatusMap] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [fitTick, setFitTick] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [addAtNext, setAddAtNext] = useState(null);
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

  // If admin logs out while editing, drop edit mode
  useEffect(() => { if (!isAdmin) { setEditMode(false); setLinkingFrom(null); setAddAtNext(null); } }, [isAdmin]);

  // Live status polling
  useEffect(() => {
    if (!map || !autoRefresh) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getStatus(id);
        if (!cancelled) setStatusMap(s.nodes || {});
      } catch { /* ignore */ }
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

  const requireAdmin = () => {
    toast({ title: "Admin sign-in required", description: "Only admins can edit topology." });
    navigate("/", { state: { from: `/maps/${id}` } });
  };

  const handleNodeClick = (node) => {
    if (editMode && linkingFrom && linkingFrom !== "__pick__") {
      if (linkingFrom === node.id) { setLinkingFrom(null); return; }
      addEdge(id, { source: linkingFrom, target: node.id, label: "" })
        .then(() => { toast({ title: "Link created" }); setLinkingFrom(null); load(); })
        .catch((e) => toast({ title: "Failed to link", description: String(e.response?.data?.detail || e.message || e) }));
      return;
    }
    if (editMode && linkingFrom === "__pick__") { setLinkingFrom(node.id); return; }
    setSelectedId(node.id);
  };

  const handleCanvasClick = (pos) => {
    if (editMode && addAtNext) {
      const type = addAtNext;
      addNode(id, {
        label: `New ${type}`, type,
        x: pos.x - 30, y: pos.y - 30, w: 60, h: 60,
      }).then(() => { toast({ title: `Added ${type}` }); setAddAtNext(null); load(); })
        .catch((e) => toast({ title: "Failed to add", description: String(e.response?.data?.detail || e.message || e) }));
    } else {
      setSelectedId(null);
    }
  };

  const handleNodeDrag = (nodeId, x, y) => {
    if (!editMode) return;
    setMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    }));
  };

  const persistNodePosition = async (nodeId, x, y) => {
    if (!editMode) return;
    try { await updateNode(id, nodeId, { x, y }); } catch { /* ignore */ }
  };

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
      toast({ title: "Failed to save", description: String(e.response?.data?.detail || e.message || e) });
    }
  };

  const removeNode = async () => {
    if (!selectedNode) return;
    try {
      await deleteNode(id, selectedNode.id);
      toast({ title: "Device removed" });
      setSelectedId(null);
      load();
    } catch (e) { toast({ title: "Failed to delete", description: String(e.response?.data?.detail || e.message || e) }); }
  };

  const toggleEdit = () => {
    if (!isAdmin) return requireAdmin();
    setEditMode((v) => !v);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--nm-app-bg))] text-[hsl(var(--nm-text-strong))] flex flex-col">
      <header className="px-6 py-3 border-b border-[hsl(var(--nm-panel-border))] flex items-center gap-4 bg-[hsl(var(--nm-header-bg)/0.85)] backdrop-blur">
        <button onClick={() => navigate("/maps")} className="text-[hsl(var(--nm-text-muted))] hover:text-[hsl(var(--nm-text-strong))] flex items-center gap-1.5">
          <ArrowLeft size={16} /> <span className="text-sm">Maps</span>
        </button>
        <div className="h-6 w-px bg-[hsl(var(--nm-panel-border))]" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold truncate">{map?.name || (loading ? "Loading..." : "Map")}</h1>
          {map?.description ? <p className="text-xs text-[hsl(var(--nm-text-muted))] mono truncate">{map.description}</p> : null}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-3 mr-2 text-xs mono">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,.5)]"/> {stats.up}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,.5)]"/> {stats.warn}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,.5)]"/> {stats.down}</span>
          </div>
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh((v) => !v)}
                  className="bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-[hsl(var(--nm-text-strong))]">
            <Radio size={14} className={`mr-1.5 ${autoRefresh ? "text-emerald-500" : "text-[hsl(var(--nm-text-muted))]"}`} />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={load}
                  className="bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-[hsl(var(--nm-text-strong))]">
            <RefreshCw size={14} className="mr-1.5" /> Reload
          </Button>
          {isAdmin ? (
            <Button size="sm" onClick={toggleEdit}
                    className={editMode ? "bg-amber-500 hover:bg-amber-400 text-slate-950" : "bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))]"}>
              {editMode ? <><Save size={14} className="mr-1.5"/> Done</> : <><Edit3 size={14} className="mr-1.5"/> Edit</>}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs mono text-[hsl(var(--nm-text-muted))] px-2 py-1 rounded-md border border-[hsl(var(--nm-panel-border))]">
                <EyeIcon size={13}/> View only
              </span>
              <Button size="sm" onClick={() => navigate("/", { state: { from: `/maps/${id}` } })}
                      className="bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))]">
                <LogIn size={14} className="mr-1.5"/> Admin
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {isAdmin && (
          <aside className="w-60 border-r border-[hsl(var(--nm-panel-border))] bg-[hsl(var(--nm-header-bg)/0.85)] flex flex-col">
            <div className="px-4 py-3 border-b border-[hsl(var(--nm-panel-border))]">
              <p className="mono text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--nm-text-muted))]">Add device</p>
              <p className="text-xs text-[hsl(var(--nm-text-muted))] mt-1">{editMode ? "Click a type, then click the canvas." : "Enable edit mode to add devices."}</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 grid grid-cols-2 gap-2">
                {DEVICE_TYPES.filter((t) => t !== "generic").map((t) => (
                  <button key={t} disabled={!editMode} onClick={() => setAddAtNext(t)}
                    className={`group flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all
                      ${!editMode ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                      ${addAtNext === t ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.1)]" : "border-[hsl(var(--nm-panel-border))] bg-[hsl(var(--nm-app-bg))] hover:border-[hsl(var(--primary)/0.5)]"}`}
                  >
                    <div className="h-8 w-8 rounded-md grid place-items-center" style={{ background: `${typeColor(t)}20`, color: typeColor(t) }}>
                      <DeviceIcon type={t} size={18} />
                    </div>
                    <span className="text-[11px] text-[hsl(var(--nm-text-strong))] capitalize">{t}</span>
                  </button>
                ))}
              </div>
              {editMode && (
                <div className="px-3 pb-3">
                  <Button size="sm" onClick={() => setLinkingFrom((v) => (v ? null : "__pick__"))}
                          variant="outline"
                          className={`w-full ${linkingFrom ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : "bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))]"}`}>
                    <Link2 size={14} className="mr-1.5" /> {linkingFrom ? "Cancel link" : "Draw link"}
                  </Button>
                  <p className="text-[10.5px] text-[hsl(var(--nm-text-muted))] mt-2 leading-relaxed">
                    {linkingFrom === "__pick__" ? "Pick source node..." : linkingFrom ? "Pick target node..." : "Connect two nodes with a link."}
                  </p>
                </div>
              )}
            </ScrollArea>
          </aside>
        )}

        <main className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 grid place-items-center text-[hsl(var(--nm-text-muted))]">
              <div className="flex items-center gap-2"><Loader2 className="animate-spin"/> Loading topology...</div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 grid place-items-center text-rose-500 mono text-sm">{error}</div>
          )}
          {map && (
            <TopologyCanvas
              map={map} statusMap={statusMap}
              selectedId={selectedId} hoveredId={hoveredId}
              editMode={editMode}
              linkingFrom={linkingFrom && linkingFrom !== "__pick__" ? linkingFrom : null}
              zoom={zoom} onZoomChange={setZoom} fitTick={fitTick}
              onNodeClick={handleNodeClick}
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
                  <button onClick={() => setZoom((z) => Math.min(4, z * 1.25))} className="h-8 w-8 grid place-items-center text-[hsl(var(--nm-text-strong))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--nm-app-bg))] rounded"><ZoomIn size={16}/></button>
                </TooltipTrigger><TooltipContent side="left">Zoom in</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => setZoom((z) => Math.max(0.2, z / 1.25))} className="h-8 w-8 grid place-items-center text-[hsl(var(--nm-text-strong))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--nm-app-bg))] rounded"><ZoomOut size={16}/></button>
                </TooltipTrigger><TooltipContent side="left">Zoom out</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild>
                  <button onClick={() => setFitTick((t) => t + 1)} className="h-8 w-8 grid place-items-center text-[hsl(var(--nm-text-strong))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--nm-app-bg))] rounded"><Maximize2 size={16}/></button>
                </TooltipTrigger><TooltipContent side="left">Fit to view</TooltipContent></Tooltip>
              </div>
            </TooltipProvider>
            <div className="panel rounded-lg px-2.5 py-1 mono text-[11px] text-[hsl(var(--nm-text-muted))]">{Math.round(zoom * 100)}%</div>
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
                    <div className="text-[hsl(var(--nm-text-strong))] text-sm truncate">{n.label || typeLabel(n.type)}</div>
                    <div className="mono text-[10px] text-[hsl(var(--nm-text-muted))] truncate">{n.ip || typeLabel(n.type)}</div>
                  </div>
                  <StatusPill status={s?.status} />
                </div>
                {s?.latency != null && <div className="mono text-[10.5px] text-[hsl(var(--nm-text-muted))] mt-1">latency {s.latency} ms</div>}
              </div>
            );
          })()}

          {/* Legend */}
          <div className="absolute left-4 top-4 panel rounded-lg px-3 py-2 z-10">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--nm-text-muted))] mb-1">Status</div>
            <div className="flex items-center gap-3 mono text-[11px]">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500"/> up</span>
              <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300"><span className="h-2 w-2 rounded-full bg-amber-500"/> warn</span>
              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-300"><span className="h-2 w-2 rounded-full bg-rose-500"/> down</span>
            </div>
          </div>

          {editMode && addAtNext && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 panel rounded-full px-3 py-1.5 z-10 flex items-center gap-2 mono text-[11px]">
              <MousePointer2 size={12} className="text-[hsl(var(--primary))]"/> Click on canvas to place a <b className="capitalize">{addAtNext}</b>
              <button onClick={() => setAddAtNext(null)} className="text-[hsl(var(--nm-text-muted))] hover:text-[hsl(var(--nm-text-strong))] ml-1"><X size={12}/></button>
            </div>
          )}

          {!isAdmin && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 panel rounded-full px-3 py-1.5 z-10 flex items-center gap-2 mono text-[11px] text-[hsl(var(--nm-text-muted))]">
              <Lock size={12}/> View-only mode — <button className="text-[hsl(var(--primary))] hover:underline" onClick={() => navigate("/", { state: { from: `/maps/${id}` } })}>sign in as admin</button> to edit
            </div>
          )}
        </main>

        {/* Right: details drawer */}
        <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
          <SheetContent side="right" className="bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-[hsl(var(--nm-text-strong))] w-[380px] sm:max-w-[420px] p-0">
            {selectedNode && nodeForm && (
              <div className="h-full flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-[hsl(var(--nm-panel-border))]">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-lg grid place-items-center" style={{ background: `${typeColor(selectedNode.type)}22`, color: typeColor(selectedNode.type) }}>
                      <DeviceIcon type={selectedNode.type} size={22}/>
                    </div>
                    <div className="min-w-0">
                      <SheetTitle className="truncate">{selectedNode.label || typeLabel(selectedNode.type)}</SheetTitle>
                      <SheetDescription className="mono text-[11px] text-[hsl(var(--nm-text-muted))] truncate">{typeLabel(selectedNode.type)}</SheetDescription>
                    </div>
                    <div className="ml-auto"><StatusPill status={statusMap[selectedNode.id]?.status}/></div>
                  </div>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  <div className="p-5 space-y-5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-[hsl(var(--nm-panel-border))] p-3">
                        <div className="mono text-[10px] uppercase text-[hsl(var(--nm-text-muted))] tracking-wider">Latency</div>
                        <div className="mono text-xl mt-1">{statusMap[selectedNode.id]?.latency ?? "—"}<span className="text-[hsl(var(--nm-text-muted))] text-xs ml-1">ms</span></div>
                      </div>
                      <div className="rounded-lg border border-[hsl(var(--nm-panel-border))] p-3">
                        <div className="mono text-[10px] uppercase text-[hsl(var(--nm-text-muted))] tracking-wider">Uptime</div>
                        <div className="mono text-xl mt-1">{statusMap[selectedNode.id]?.uptime ?? "—"}<span className="text-[hsl(var(--nm-text-muted))] text-xs ml-1">%</span></div>
                      </div>
                      <div className="rounded-lg border border-[hsl(var(--nm-panel-border))] p-3">
                        <div className="mono text-[10px] uppercase text-[hsl(var(--nm-text-muted))] tracking-wider">Loss</div>
                        <div className="mono text-xl mt-1">{statusMap[selectedNode.id]?.loss ?? "—"}<span className="text-[hsl(var(--nm-text-muted))] text-xs ml-1">%</span></div>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div>
                        <Label>Label</Label>
                        <Input value={nodeForm.label || ""} onChange={(e) => setNodeForm({ ...nodeForm, label: e.target.value })}
                               disabled={!isAdmin}
                               className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))] mt-1" />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select value={nodeForm.type} onValueChange={(v) => isAdmin && setNodeForm({ ...nodeForm, type: v })} disabled={!isAdmin}>
                          <SelectTrigger className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))] mt-1"><SelectValue/></SelectTrigger>
                          <SelectContent className="bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-[hsl(var(--nm-text-strong))]">
                            {DEVICE_TYPES.map((t) => (
                              <SelectItem key={t} value={t} className="capitalize">
                                <div className="flex items-center gap-2">
                                  <DeviceIcon type={t} size={14}/>
                                  <span className="capitalize">{t}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>IP / Address</Label>
                        <Input value={nodeForm.ip || ""} onChange={(e) => setNodeForm({ ...nodeForm, ip: e.target.value })}
                               disabled={!isAdmin} placeholder="10.0.0.1"
                               className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))] mono mt-1" />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea value={nodeForm.description || ""} onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })}
                                  disabled={!isAdmin} placeholder="Notes about this device" rows={4}
                                  className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))] mt-1" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="mono text-[10px] uppercase text-[hsl(var(--nm-text-muted))] tracking-wider">Connected links</div>
                      </div>
                      <div className="space-y-1.5">
                        {(map.edges || [])
                          .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                          .map((e) => {
                            const otherId = e.source === selectedNode.id ? e.target : e.source;
                            const other = map.nodes.find((n) => n.id === otherId);
                            return (
                              <div key={e.id} className="flex items-center gap-2 text-xs bg-[hsl(var(--nm-app-bg))] border border-[hsl(var(--nm-panel-border))] rounded px-2 py-1.5">
                                <Activity size={12} className="text-[hsl(var(--primary))]"/>
                                <span className="truncate flex-1">{other?.label || typeLabel(other?.type || "generic")}</span>
                                {isAdmin && editMode && (
                                  <button className="text-[hsl(var(--nm-text-muted))] hover:text-rose-500" onClick={async () => {
                                    await deleteEdge(id, e.id); load();
                                  }}><Trash2 size={12}/></button>
                                )}
                              </div>
                            );
                          })}
                        {(map.edges || []).filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length === 0 && (
                          <div className="text-[11px] text-[hsl(var(--nm-text-muted))] mono">No links.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
                <div className="border-t border-[hsl(var(--nm-panel-border))] p-4 flex items-center gap-2">
                  {isAdmin ? (
                    <>
                      <Button variant="outline" onClick={removeNode}
                              className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))] text-rose-500 hover:bg-rose-500/10">
                        <Trash2 size={14} className="mr-1.5"/> Delete
                      </Button>
                      <div className="ml-auto flex gap-2">
                        <Button variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
                        <Button onClick={saveNode} className="bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))]">
                          <Save size={14} className="mr-1.5"/> Save
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] mono text-[hsl(var(--nm-text-muted))] inline-flex items-center gap-1.5">
                        <Lock size={12}/> Sign in as admin to edit
                      </span>
                      <div className="ml-auto">
                        <Button variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
