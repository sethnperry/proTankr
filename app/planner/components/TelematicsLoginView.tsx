"use client";
// app/planner/components/TelematicsLoginView.tsx
//
// Settings → Hours of service login. The driver's own telematics login, so their hours come from their
// own account. The database is the company's; the user name starts as their employee ID. They type the
// password and tap Connect, and the answer shows right here.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const muted = "rgba(255,255,255,0.5)";
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, boxSizing: "border-box" };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };

async function authed(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? "";
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, cache: "no-store" });
}

export default function TelematicsLoginView({ companyId }: { companyId: string }) {
  const [info, setInfo] = useState<{ companyConnected: boolean; database?: string; userName?: string; connected?: boolean; lastError?: string | null } | null>(null);
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const r = await authed(`/api/telematics/my-login?companyId=${encodeURIComponent(companyId)}`);
    const j = r.ok ? await r.json() : { companyConnected: false };
    setInfo(j); setUserName(j.userName ?? "");
  };
  useEffect(() => { void load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect() {
    setBusy(true); setMsg(null);
    try {
      const r = await authed("/api/telematics/my-login", { method: "POST", body: JSON.stringify({ companyId, userName: userName.trim(), password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ ok: false, text: j.error ?? "Couldn't connect." }); return; }
      setPassword("");
      setMsg({ ok: true, text: j.linked ? "Connected. Your hours will show on the dashboard." : "Connected, but I couldn't find your driver record. Tell your admin." });
      await load();
    } catch { setMsg({ ok: false, text: "Couldn't reach the server. Try again." }); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setMsg(null);
    await authed("/api/telematics/my-login", { method: "DELETE", body: JSON.stringify({ companyId }) });
    setBusy(false); setMsg({ ok: true, text: "Disconnected." }); await load();
  }

  if (!info) return <div style={{ color: muted, fontSize: 14 }}>Loading…</div>;
  if (!info.companyConnected) return <div style={{ color: muted, fontSize: 14, lineHeight: 1.5 }}>Your company hasn't connected telematics yet, so there's nothing to sign in to.</div>;

  return (
    <div>
      <div style={{ color: muted, fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
        Sign in with your own login so your hours come from your account. Only the password is stored, encrypted, and only the server can read it.
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={label}>Database</div>
        <input style={{ ...input, opacity: 0.7 }} value={info.database ?? ""} readOnly />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={label}>User name</div>
        <input style={input} value={userName} onChange={(e) => setUserName(e.target.value)} autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="Your employee ID" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={label}>Password</div>
        <input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
          onKeyDown={(e) => { if (e.key === "Enter" && password && userName.trim()) void connect(); }} />
      </div>
      <button type="button" disabled={busy || !password || !userName.trim()} aria-busy={busy} onClick={() => void connect()}
        style={{ width: "100%", padding: "14px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: busy || !password || !userName.trim() ? 0.5 : 1 }}>
        {busy ? "Connecting…" : info.connected ? "Reconnect" : "Connect"}
      </button>
      {msg && <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.ok ? "✓ " : ""}{msg.text}</div>}
      {!msg && info.connected && <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: "#4ade80" }}>✓ Connected as {info.userName}</div>}
      {info.connected && <button type="button" onClick={() => void disconnect()} style={{ marginTop: 12, background: "none", border: "none", color: muted, fontSize: 13, cursor: "pointer", padding: 0 }}>Disconnect</button>}
    </div>
  );
}
