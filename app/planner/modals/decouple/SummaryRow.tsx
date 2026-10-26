"use client";
// app/planner/modals/decouple/SummaryRow.tsx
//
// Part of DecoupleModal.tsx.


import { TRUCK_STATUSES, TRAILER_STATUSES } from "./helpers";

export function SummaryRow({ label, code, location, notes }: { label: string; code: string; location: string; notes: string }) {
  const allStatuses = [...TRUCK_STATUSES, ...TRAILER_STATUSES];
  const def = allStatuses.find((s) => s.code === code);
  const isWarn = def?.warn;
  return (
    <div style={{ padding: "9px 11px", borderRadius: 2, marginBottom: 8,
      border: isWarn ? "1px solid rgba(220,80,40,0.35)" : "1px solid rgba(255,255,255,0.10)",
      background: isWarn ? "rgba(180,50,20,0.12)" : "rgba(255,255,255,0.04)" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)", letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "2px 7px", borderRadius: 2,
          background: isWarn ? "rgba(220,80,40,0.20)" : "rgba(255,255,255,0.10)",
          color: isWarn ? "#fb923c" : "rgba(255,255,255,0.75)" }}>{code}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: isWarn ? "#fb923c" : "rgba(255,255,255,0.75)" }}>{def?.label ?? code}</span>
      </div>
      {location && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)" }}>📍 {location}</div>}
      {notes    && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{notes}</div>}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
