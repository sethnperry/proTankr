"use client";
// app/planner/dispatch/AllocationModal.tsx
//
// Supplier contracts against what has loaded and what is booked: today and
// this week, worst first. Warnings only; nothing here stops a load.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import type { Level, Span, Usage } from "@/lib/dispatch/allocation";

export const LEVEL_COLOR: Record<Level, string> = { none: "rgba(255,255,255,0.5)", ok: "rgba(255,255,255,0.85)", near: "#facc15", full: "#fb923c", over: "#f87171" };

export type AllocRow = { key: string; supplier: string; terminal: string; paused: boolean; usage: Usage };

function Bar({ s, unit }: { s: Span; unit: "loads" | "gallons" }) {
  const L = useDashLook();
  if (s.limit == null) return <span style={{ color: L.faint }}>no limit</span>;
  const total = s.loaded + s.booked;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  return (
    <span className="dash-num" style={{ color: LEVEL_COLOR[s.level], fontWeight: 800 }}>
      {fmt(total)} of {fmt(s.limit)} {unit === "loads" ? "" : "gal"}
      {s.booked > 0 && <span style={{ fontWeight: 600, color: L.muted }}> ({fmt(s.booked)} booked)</span>}
    </span>
  );
}

export function AllocationModal({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: AllocRow[] }) {
  const L = useDashLook();
  return (
    <FullscreenModal open={open} title="Supplier allocation" onClose={onClose}>
      {rows.length === 0 ? (
        <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>
          No supplier has a daily or weekly limit set. Add limits under Suppliers › a supplier › Contract.
        </div>
      ) : rows.map((r) => (
        <div key={r.key} style={{ ...L.secondary, padding: "10px 12px", marginBottom: 6, opacity: r.paused ? 0.6 : 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span aria-hidden style={{ width: 8, height: 8, background: LEVEL_COLOR[r.usage.level], alignSelf: "center", flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.supplier}</span>
            {r.paused && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "#fb923c" }}>PAUSED</span>}
          </div>
          <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{r.terminal}</div>
          <div style={{ display: "flex", gap: 14, fontSize: 13, marginTop: 6, flexWrap: "wrap" }}>
            <span><span style={{ color: L.muted }}>Today </span><Bar s={r.usage.day} unit={r.usage.unit} /></span>
            <span><span style={{ color: L.muted }}>Week </span><Bar s={r.usage.week} unit={r.usage.unit} /></span>
          </div>
        </div>
      ))}
    </FullscreenModal>
  );
}
