import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Workflow, Lock, Loader2, Eye, EyeOff, ArrowRight, MonitorCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthProvider";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { login, continueAsViewer, isAdmin, viewer, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/maps";

  // If already authed, go straight to the app
  useEffect(() => {
    if (ready && (isAdmin || viewer)) navigate(from, { replace: true });
  }, [ready, isAdmin, viewer, from, navigate]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!username.trim() || !password) { setError("Please enter both fields"); return; }
    setBusy(true); setError(null);
    try {
      const user = await login(username.trim(), password);
      toast({ title: `Welcome, ${user.username}`, description: "You now have admin access." });
      navigate(from, { replace: true });
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || "Login failed";
      setError(msg);
    } finally { setBusy(false); }
  };

  const handleViewer = () => {
    continueAsViewer();
    toast({ title: "Viewer mode", description: "You can browse all maps (read-only)." });
    navigate("/maps");
  };

  return (
    <div className="App min-h-screen grid-bg noise relative flex items-center justify-center p-6">
      <div className="absolute top-5 left-6 flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.35)] grid place-items-center">
          <Workflow className="text-[hsl(var(--primary))]" size={22} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[hsl(var(--nm-text-strong))]">NetMap</h1>
          <p className="mono text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--nm-text-muted))]">Network topology monitor</p>
        </div>
      </div>
      <div className="absolute top-5 right-6"><ThemeToggle /></div>

      <div className="w-full max-w-md panel rounded-2xl p-8 shadow-xl relative">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg grid place-items-center bg-[hsl(var(--primary)/0.12)] border border-[hsl(var(--primary)/0.3)]">
            <Lock className="text-[hsl(var(--primary))]" size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[hsl(var(--nm-text-strong))]">Admin Sign In</h2>
            <p className="mono text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--nm-text-muted))]">Restricted access · edit & upload</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 mt-5">
          <div className="space-y-1.5">
            <Label className="text-[hsl(var(--nm-text-strong))]">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoFocus
                   className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[hsl(var(--nm-text-strong))]">Password</Label>
            <div className="relative">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                     type={showPass ? "text" : "password"}
                     className="bg-[hsl(var(--nm-app-bg))] border-[hsl(var(--nm-panel-border))] pr-10" />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--nm-text-muted))] hover:text-[hsl(var(--nm-text-strong))]">
                {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          {error && (
            <div className="text-sm text-rose-500 flex items-center gap-1.5"><Lock size={14}/> {error}</div>
          )}
          <Button type="submit" disabled={busy}
                  className="w-full bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))]">
            {busy ? <><Loader2 size={16} className="animate-spin mr-1.5"/> Signing in...</> : <><Lock size={16} className="mr-1.5"/> Sign in as admin</>}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[hsl(var(--nm-panel-border))]" />
          <span className="mono text-[10px] uppercase tracking-wider text-[hsl(var(--nm-text-muted))]">or</span>
          <div className="flex-1 h-px bg-[hsl(var(--nm-panel-border))]" />
        </div>

        <Button variant="outline" onClick={handleViewer}
                className="w-full bg-transparent border-[hsl(var(--nm-panel-border))] text-[hsl(var(--nm-text-strong))] hover:border-[hsl(var(--primary)/0.6)]">
          <MonitorCog size={16} className="mr-1.5 text-[hsl(var(--primary))]"/> Continue as viewer <ArrowRight size={14} className="ml-1.5"/>
        </Button>

        <div className="mt-6 text-[11px] mono text-[hsl(var(--nm-text-muted))] leading-relaxed">
          Viewers can browse maps (read-only).<br/>
          Admins can edit devices, draw links, and upload <span className="text-[hsl(var(--primary))]">.drawio</span> files.
        </div>
      </div>
    </div>
  );
}
