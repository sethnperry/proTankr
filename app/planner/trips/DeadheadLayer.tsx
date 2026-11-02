"use client";
// app/planner/trips/DeadheadLayer.tsx
//
// The admin layer under a PTD: the trip's empty (deadhead) segments with a Billable / Not billable choice each.
// Screen only (never printed, never part of the PTD) and shown to company admins. Presentational: segments and
// flags in, a callback out.

import React from "react";
import { KIND_LABEL, fmtMin, totals, type DhSegment, type Flags } from "@/lib/trips/deadhead";

const HAIR = "rgba(255,255,255,0.12)";
const choice = (on: boolean, color: string): React.CSSProperties => ({ flex: 1, padding: "9px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? color : "rgba(255,255,255,0.2)"}`, background: on ? color : "transparent", color: on ? "#000" : "#fff" });

export function DeadheadLayer({ segments, flags, onSet, busyKey }: { segments: DhSegment[]; flags: Flags; onSet: (key: string, billable: boolean | null) => void; busyKey: string | null }) {
  if (segments.length === 0) return null;
  const t = totals(segments, flags);
  return (
    <div className="no-print" style={{ marginTop: 22, border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Admin only · empty miles</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "4px 0 10px" }}>Empty travel between cities. This is not on the PTD.</div>
      {segments.map((s) => {
        const f = flags[s.key];
        return (
          <div key={s.key} style={{ borderTop: `1px solid ${HAIR}`, padding: "10px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{KIND_LABEL[s.kind]}</span>
              <span className="dash-num" style={{ fontSize: 14, fontWeight: 800 }}>{fmtMin(s.minutes ?? 0)}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{s.from} → {s.to}{s.eligible ? "" : " · same city"}</div>
            <div style={{ display: "flex", gap: 6, opacity: busyKey === s.key ? 0.5 : 1 }}>
              <button type="button" style={choice(f === true, "#4ade80")} disabled={busyKey === s.key} onClick={() => onSet(s.key, f === true ? null : true)}>Billable</button>
              <button type="button" style={choice(f === false, "#fff")} disabled={busyKey === s.key} onClick={() => onSet(s.key, f === false ? null : false)}>Not billable</button>
            </div>
          </div>
        );
      })}
      <div style={{ borderTop: `1px solid ${HAIR}`, paddingTop: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
        Billable {fmtMin(t.billable)} · Not billable {fmtMin(t.notBillable)} · Not reviewed {fmtMin(t.unreviewed)}
      </div>
    </div>
  );
}
