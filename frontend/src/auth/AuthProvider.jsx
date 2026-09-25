import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { API, api } from "@/lib/api";

const AuthCtx = createContext({ user: null, token: null, login: async () => {}, logout: () => {} });

const STORAGE_KEY = "netmap.auth";
const VIEWER_KEY = "netmap.viewer";

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, token: null, viewer: false, ready: false });

  const applyToken = useCallback((token) => {
    if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete api.defaults.headers.common.Authorization;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const viewerRaw = localStorage.getItem(VIEWER_KEY);
        if (!raw) {
          setState((s) => ({ ...s, viewer: viewerRaw === "1", ready: true }));
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed?.token) {
          applyToken(parsed.token);
          try {
            const { data } = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${parsed.token}` } });
            setState({ user: data.user, token: parsed.token, viewer: false, ready: true });
            return;
          } catch {
            localStorage.removeItem(STORAGE_KEY);
            applyToken(null);
          }
        }
      } catch {}
      setState((s) => ({ ...s, viewer: localStorage.getItem(VIEWER_KEY) === "1", ready: true }));
    })();
  }, [applyToken]);

  const login = useCallback(async (username, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { username, password });
    applyToken(data.token);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
      localStorage.removeItem(VIEWER_KEY);
    } catch {}
    setState({ user: data.user, token: data.token, viewer: false, ready: true });
    return data.user;
  }, [applyToken]);

  const continueAsViewer = useCallback(() => {
    try { localStorage.setItem(VIEWER_KEY, "1"); } catch {}
    setState({ user: null, token: null, viewer: true, ready: true });
  }, []);

  const logout = useCallback(() => {
    applyToken(null);
    try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(VIEWER_KEY); } catch {}
    setState({ user: null, token: null, viewer: false, ready: true });
  }, [applyToken]);

  const value = { ...state, isAdmin: state.user?.role === "admin", login, logout, continueAsViewer };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  return useContext(AuthCtx);
}
