"use client";
// app/admin/CalloutsView.tsx
//
// The staff call-out list: upcoming first, then past; who, which shift, why, and who entered it. Dispatch and
// admins can create one for a driver, correct (edit) or withdraw any. Presentational: rows in, callbacks out.

import React from "react";
import type { CalloutRow } from "@/lib/trips/types";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const btn = (on?: boolean): React.CSSProperties => ({ padding: "9px 12px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export function CalloutsView(p: {
  upcoming: CalloutRow[];
  past: CalloutRow[];
  nameOf: (id: string) => string;
  tz: string;
  canEdit: boolean;
  loading: boolean;
  error: string | null;
  highlightId?: string | null;
  onNew: () => void;
  onEdit: (c: CalloutRow) => void;
  onWithdraw: (c: CalloutRow) => void;
}) {
  const when = (c: CalloutRow) => `${new Date(c.shift_start_at).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: p.tz || undefined })} ${new Date(c.shift_start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: p.tz || undefined })}`;
  const row = (c: CalloutRow, active: boolean) => (
    <div key={c.callout_id} style={{ border: `1px solid ${p.highlightId === c.callout_id ? "#fff" : HAIR}`, background: "#0f0f10", padding: 12, marginBottom: 8, opacity: c.status === "withdrawn" ? 0.55 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800 }}>{p.nameOf(c.user_id)}</span>
        <span style={{ fontSize: 12, color: c.status === "withdrawn" ? MUTE : "#fbbf24", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{c.status === "withdrawn" ? "Withdrawn" : "Called out"}</span>
      </div>
      <div style={{ fontSize: 13, marginTop: 2 }}>{when(c)} · {c.reason}{c.note ? `: ${c.note}` : ""}</div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>
        {[c.division, c.region, c.local_area].filter(Boolean).join(" · ")}
        {c.created_by !== c.user_id ? ` · entered by ${p.nameOf(c.created_by)}` : ""}
        {c.withdrawn_by && c.withdrawn_by !== c.user_id ? ` · withdrawn by ${p.nameOf(c.withdrawn_by)}` : ""}
      </div>
      {p.canEdit && active && c.status === "active" && (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button type="button" style={btn()} onClick={() => p.onEdit(c)}>Edit</button>
          <button type="button" style={btn(true)} onClick={() => p.onWithdraw(c)}>Withdraw</button>
        </div>
      )}
    </div>
  );
  return (
    <div>
      {p.canEdit && <button type="button" style={{ ...btn(true), width: "100%", marginBottom: 14, padding: "13px 0" }} onClick={p.onNew}>New call-out for a driver</button>}
      {p.error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{p.error}</div>}
      {p.loading && <div style={{ color: MUTE, fontSize: 14 }}>Loading…</div>}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>Upcoming</div>
      {p.upcoming.length === 0 && !p.loading && <div style={{ color: MUTE, fontSize: 14, marginBottom: 12 }}>No call-outs.</div>}
      {p.upcoming.map((c) => row(c, true))}
      {p.past.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, margin: "16px 0 6px" }}>Earlier</div>}
      {p.past.map((c) => row(c, false))}
    </div>
  );
}
