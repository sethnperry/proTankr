"use client";
// app/planner/components/perdiem/PerDiemSheet.tsx
//
// Per diem for the driver: set a home base once, then see the last two weeks. Days the truck's GPS (or the
// cities on the trips) says were away show as a suggestion with the city and state; one tap claims it. A day
// nothing was recorded for can be claimed by hand. Only the driver claims their own days. Presentational.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { claimProblem, sourceLabel, type DayCard, type Home, type Source } from "@/lib/perdiem/perDiem";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const input: React.CSSProperties = { boxSizing: "border-box", padding: 10, fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0 };
const btn = (on?: boolean): React.CSSProperties => ({ padding: "11px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });
const dayLabel = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }); };

export function PerDiemSheet({ open, onClose, home, cards, loading, onSaveHome, onClaim, onWithdraw }: {
  open: boolean;
  onClose: () => void;
  home: Home | null | undefined;
  cards: DayCard[];
  loading: boolean;
  onSaveHome: (city: string, state: string, radius: number) => Promise<string | null>;
  onClaim: (day: string, city: string, state: string, source: Source) => void;
  onWithdraw: (day: string) => void;
}) {
  const [editHome, setEditHome] = useState(false);
  const [hc, setHc] = useState(""); const [hs, setHs] = useState(""); const [hr, setHr] = useState("50");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [city, setCity] = useState(""); const [st, setSt] = useState(""); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setEditHome(false); setOpenDay(null); setMsg(null); } }, [open]);
  useEffect(() => { if (home) { setHc(home.city); setHs(home.state); setHr(String(home.radiusMiles)); } }, [home]);

  const startClaim = (c: DayCard) => { setOpenDay(c.day); setErr(null); setCity(c.kind === "suggested" ? c.city ?? "" : ""); setSt(c.kind === "suggested" ? c.state ?? "" : ""); };
  const showHomeForm = home === null || editHome;

  return (
    <FullscreenModal open={open} title="Per diem" onClose={onClose} footer={null}>
      {home === undefined && <div style={{ color: MUTE }}>Loading…</div>}

      {showHomeForm && home !== undefined && (
        <div style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Where is home base?</div>
          <div style={{ fontSize: 13, color: MUTE, marginBottom: 10 }}>A day counts as away when you go beyond this distance from it.</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={hc} onChange={(e) => setHc(e.target.value)} placeholder="City" style={{ ...input, flex: 1, minWidth: 0 }} />
            <input value={hs} onChange={(e) => setHs(e.target.value)} placeholder="ST" maxLength={2} style={{ ...input, width: 64, textTransform: "uppercase" }} />
          </div>
          <label style={{ fontSize: 12, color: MUTE }}>Away means farther than (miles)<input value={hr} onChange={(e) => setHr(e.target.value)} inputMode="numeric" style={{ ...input, display: "block", width: 100, marginTop: 4 }} /></label>
          {msg && <div style={{ color: "#fbbf24", fontSize: 13, marginTop: 8 }}>{msg}</div>}
          <button type="button" disabled={busy} style={{ ...btn(true), width: "100%", marginTop: 12 }}
            onClick={async () => { setBusy(true); const e = await onSaveHome(hc, hs, Number(hr)); setBusy(false); setMsg(e); if (!e || e.startsWith("Saved")) setEditHome(false); }}>{busy ? "Saving…" : "Save home base"}</button>
        </div>
      )}

      {home && !editHome && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 13, color: MUTE }}>Home: <b style={{ color: "#fff" }}>{home.city}, {home.state}</b> · {home.radiusMiles} mi</div>
          <button type="button" style={btn()} onClick={() => setEditHome(true)}>Change</button>
        </div>
      )}

      {home && !showHomeForm && (
        <>
          {loading && <div style={{ color: MUTE, fontSize: 13, marginBottom: 8 }}>Checking your last two weeks…</div>}
          {cards.map((c) => (
            <div key={c.day} style={{ borderTop: `1px solid ${HAIR}`, padding: "12px 0", opacity: c.kind === "home" || c.kind === "unknown" ? 0.8 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 92, fontSize: 14, fontWeight: 800 }}>{dayLabel(c.day)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                  {c.kind === "claimed" && <><b>{c.city}, {c.state}</b><div style={{ fontSize: 11, color: "#4ade80" }}>Claimed · {sourceLabel(c.source)}</div></>}
                  {c.kind === "suggested" && <><b>{c.city ? `${c.city}${c.state ? `, ${c.state}` : ""}` : "Away from home"}</b><div style={{ fontSize: 11, color: "#fbbf24" }}>Suggested · {sourceLabel(c.source)}{c.detail ? ` · ${c.detail}` : ""}</div></>}
                  {c.kind === "home" && <span style={{ color: MUTE }}>Home</span>}
                  {c.kind === "unknown" && <span style={{ color: MUTE }}>Nothing recorded</span>}
                </span>
                {c.kind === "claimed" && <button type="button" style={btn()} onClick={() => onWithdraw(c.day)}>Take back</button>}
                {c.kind === "suggested" && c.city && c.state && <button type="button" style={btn(true)} onClick={() => onClaim(c.day, c.city!, c.state!, c.source)}>Claim</button>}
                {(c.kind === "suggested" || c.kind === "home" || c.kind === "unknown") && <button type="button" style={btn()} onClick={() => (openDay === c.day ? setOpenDay(null) : startClaim(c))}>{c.kind === "suggested" ? "Edit" : "I was away"}</button>}
              </div>
              {openDay === c.day && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ ...input, flex: 1, minWidth: 0 }} />
                    <input value={st} onChange={(e) => setSt(e.target.value)} placeholder="ST" maxLength={2} style={{ ...input, width: 64, textTransform: "uppercase" }} />
                  </div>
                  {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>}
                  <button type="button" style={{ ...btn(true), width: "100%", marginTop: 8 }}
                    onClick={() => { const p = claimProblem(city, st); if (p) { setErr(p); return; } onClaim(c.day, city, st, c.kind === "suggested" && c.city?.toLowerCase() === city.trim().toLowerCase() ? c.source : "manual"); setOpenDay(null); }}>Claim this day</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </FullscreenModal>
  );
}
