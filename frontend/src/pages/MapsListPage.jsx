import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Activity, Workflow, Router, AlertCircle, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { listMaps, createMap, deleteMap } from "@/lib/api";
import { DeviceIcon, typeColor } from "@/lib/deviceIcons";

function StatusChip({ up = 0, warn = 0, down = 0 }) {
  return (
    <div className="flex items-center gap-3 text-xs mono">
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,.6)]" />{up}</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,.5)]" />{warn}</span>
      <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_2px_rgba(244,63,94,.5)]" />{down}</span>
    </div>
  );
}

function MiniPreview({ nodes = [], edges = [] }) {
  const box = { minX: 0, minY: 0, maxX: 1400, maxY: 900 };
  if (nodes.length) {
    box.minX = Math.min(...nodes.map((n) => n.x));
    box.minY = Math.min(...nodes.map((n) => n.y));
    box.maxX = Math.max(...nodes.map((n) => n.x + (n.w || 40)));
    box.maxY = Math.max(...nodes.map((n) => n.y + (n.h || 40)));
  }
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <svg viewBox={`${box.minX - 20} ${box.minY - 20} ${w + 40} ${h + 40}`} className="w-full h-32">
      <defs>
        <pattern id="minigrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(80,140,190,0.12)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={box.minX - 20} y={box.minY - 20} width={w + 40} height={h + 40} fill="url(#minigrid)" />
      {edges.map((e) => {
        const s = nodeById[e.source]; const t = nodeById[e.target];
        if (!s || !t) return null;
        return (
          <line key={e.id} x1={s.x + (s.w || 40) / 2} y1={s.y + (s.h || 40) / 2}
                x2={t.x + (t.w || 40) / 2} y2={t.y + (t.h || 40) / 2}
                stroke="rgba(120,200,255,0.35)" strokeWidth="2" />
        );
      })}
      {nodes.map((n) => (
        <circle key={n.id} cx={n.x + (n.w || 40) / 2} cy={n.y + (n.h || 40) / 2}
                r={6} fill={typeColor(n.type)} opacity={0.9} />
      ))}
    </svg>
  );
}

export default function MapsListPage() {
  const [maps, setMaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const data = await listMaps();
      setMaps(data);
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load maps");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return maps;
    const t = q.toLowerCase();
    return maps.filter((m) =>
      (m.name || "").toLowerCase().includes(t) ||
      (m.description || "").toLowerCase().includes(t)
    );
  }, [maps, q]);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required" }); return; }
    setCreating(true);
    try {
      const created = await createMap({ name: form.name, description: form.description });
      toast({ title: "Map created", description: form.name });
      setCreateOpen(false);
      setForm({ name: "", description: "" });
      navigate(`/maps/${created.id}`);
    } catch (e) {
      toast({ title: "Failed to create map", description: String(e.message || e) });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await deleteMap(confirmDel.id);
      toast({ title: "Map deleted", description: confirmDel.name });
      setConfirmDel(null);
      load();
    } catch (e) {
      toast({ title: "Failed to delete", description: String(e.message || e) });
    }
  };

  return (
    <div className="grid-bg min-h-screen noise relative">
      <div className="px-8 py-6 border-b border-slate-800/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-500/25 to-cyan-400/10 border border-sky-500/30 grid place-items-center">
            <Workflow className="text-sky-400" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">NetMap</h1>
            <p className="mono text-[10.5px] uppercase tracking-[0.28em] text-slate-500">Network topology monitor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search maps..."
                   className="pl-9 w-72 bg-slate-900/60 border-slate-700 text-slate-100 placeholder:text-slate-500" />
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-medium">
                <Plus size={16} className="mr-1" /> New Map
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-950 border-slate-800 text-slate-100">
              <DialogHeader><DialogTitle>Create new map</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                         placeholder="e.g. HQ Data Center" className="bg-slate-900 border-slate-700" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                            placeholder="Purpose, location, tags" className="bg-slate-900 border-slate-700" rows={3} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreateOpen(false)} className="text-slate-300">Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} className="bg-sky-500 hover:bg-sky-400 text-slate-950">
                  {creating ? <Loader2 size={16} className="animate-spin mr-1" /> : <Plus size={16} className="mr-1" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="px-8 py-8">
        {loading && (
          <div className="flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={18}/> Loading maps...</div>
        )}
        {error && !loading && (
          <div className="flex items-center gap-2 text-rose-400"><AlertCircle size={16}/> {error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-slate-500 mono text-sm">No maps match your search.</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((m) => (
            <div key={m.id} className="map-card panel rounded-2xl overflow-hidden group">
              <div className="relative" onClick={() => navigate(`/maps/${m.id}`)} role="button">
                <MiniPreview nodes={m.nodes} edges={m.edges} />
              </div>
              <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0" onClick={() => navigate(`/maps/${m.id}`)} role="button">
                    <h3 className="text-slate-100 font-semibold truncate">{m.name}</h3>
                    <p className="text-slate-500 text-xs line-clamp-2 mt-0.5">{m.description || "No description"}</p>
                  </div>
                  <button onClick={() => setConfirmDel(m)} className="text-slate-500 hover:text-rose-400 transition-colors" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 mono text-[11px] text-slate-500">
                    <Router size={12} /> {m.nodes?.length || 0} nodes
                    <span className="text-slate-700">•</span>
                    <Activity size={12} /> {m.edges?.length || 0} links
                  </div>
                  <StatusChip up={m.stats?.up || 0} warn={m.stats?.warn || 0} down={m.stats?.down || 0} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(m.typeSummary || []).slice(0, 6).map((t) => (
                    <Badge key={t.type} variant="outline" className="bg-slate-900/50 border-slate-700 text-slate-300 font-normal">
                      <DeviceIcon type={t.type} size={12} className="mr-1" /> {t.type} · {t.count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent className="bg-slate-950 border-slate-800 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this map?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              “{confirmDel?.name}” will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-900 border-slate-700 text-slate-200">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-500 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
