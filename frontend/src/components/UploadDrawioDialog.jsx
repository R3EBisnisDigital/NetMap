import React, { useRef, useState } from "react";
import { Upload, FileUp, Loader2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { API } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "@/hooks/use-toast";

export default function UploadDrawioDialog({ open, onOpenChange, onUploaded }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const dragCountRef = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const { token } = useAuth();

  const reset = () => { setFile(null); setName(""); setDescription(""); setError(null); };

  const handleFile = (f) => {
    if (!f) return;
    if (!/\.(drawio|xml)$/i.test(f.name)) {
      setError("Only .drawio or .xml files are supported");
      return;
    }
    setError(null);
    setFile(f);
    if (!name) setName(f.name.replace(/\.(drawio|xml)$/i, ""));
  };

  const submit = async () => {
    if (!file) { setError("Choose a .drawio file first"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name || file.name);
      fd.append("description", description || "");
      const resp = await fetch(`${API}/maps/upload`, {
        method: "POST",
        body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j.detail || `Upload failed (${resp.status})`);
      }
      const map = await resp.json();
      toast({ title: "Map imported", description: `${map.name} — ${map.nodes.length} nodes, ${map.edges.length} links` });
      onUploaded?.(map);
      onOpenChange(false);
      reset();
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="bg-[hsl(var(--nm-panel-bg))] border-[hsl(var(--nm-panel-border))] text-[hsl(var(--nm-text-strong))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileUp size={18} className="text-[hsl(var(--primary))]"/> Upload a .drawio topology</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDragEnter={(e) => { e.preventDefault(); dragCountRef.current++; setDragOver(true); }}
            onDragLeave={() => { dragCountRef.current = Math.max(0, dragCountRef.current - 1); if (!dragCountRef.current) setDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); dragCountRef.current = 0; handleFile(e.dataTransfer.files?.[0]); }}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-6 cursor-pointer text-center transition-colors
              ${dragOver ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.06)]" : "border-[hsl(var(--nm-panel-border))] hover:border-[hsl(var(--primary)/0.6)]"}`}
          >
            <input ref={inputRef} type="file" accept=".drawio,.xml" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
            <Upload size={26} className="mx-auto text-[hsl(var(--primary))] mb-2"/>
            <div className="text-sm text-[hsl(var(--nm-text-strong))]">
              {file ? (
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium">{file.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-[hsl(var(--nm-text-muted))] hover:text-rose-500"><X size={14}/></button>
                </span>
              ) : (
                <>Drop a .drawio file here, or click to browse</>
              )}
            </div>
            <p className="mono text-[11px] text-[hsl(var(--nm-text-muted))] mt-1">Supported: .drawio, .xml</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[hsl(var(--nm-text-strong))]">Map name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank to use filename"
                   className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[hsl(var(--nm-text-strong))]">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                      placeholder="Optional notes"
                      className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))]" />
          </div>
          {error && <div className="text-sm text-rose-500">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !file}
                  className="bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))]">
            {busy ? <><Loader2 size={16} className="animate-spin mr-1.5"/> Uploading...</> : <><FileUp size={16} className="mr-1.5"/> Import map</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
