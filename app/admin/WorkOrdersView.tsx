"use client";
// app/admin/WorkOrdersView.tsx
//
// The work order list: pump downs, failed inspections and repair requests in one place. Presentational: rows in,
// callbacks out, no data code, so it renders without a browser.

import React from "react";
import type { WorkOrderItem } from "@/lib/workorders/workOrderList";
import type { WorkOrderStatus } from "@/lib/trips/types";

const muted = "rgba(255,255,255,0.5)";
const btn = (on?: boolean): React.CSSProperties => ({ padding: "7px 10px", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.2)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export function WorkOrdersView(p: {
  items: WorkOrderItem[];
  openCount: number;
  showClosed: boolean;
  onShowClosed: (v: boolean) => void;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  onStatus: (id: string, status: WorkOrderStatus) => void;
  busyId: string | null;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 13, color: muted }}>{p.openCount} open</div>
        <button type="button" style={btn(!p.showClosed)} onClick={() => p.onShowClosed(false)}>Open</button>
        <button type="button" style={btn(p.showClosed)} onClick={() => p.onShowClosed(true)}>All</button>
      </div>
      {p.error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{p.error}</div>}
      {p.loading && p.items.length === 0 && <div style={{ color: muted, fontSize: 14 }}>Loading…</div>}
      {!p.loading && p.items.length === 0 && <div style={{ color: muted, fontSize: 14 }}>No work orders{p.showClosed ? "" : " open"}.</div>}
      {p.items.map((i) => (
        <div key={i.id} style={{ border: "1px solid rgba(255,255,255,0.12)", background: "#0f0f10", padding: 14, marginBottom: 8, opacity: i.open ? 1 : 0.6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800 }}>{i.subject}</div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: i.status === "open" ? "#fbbf24" : muted }}>{i.statusLabel}</div>
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 3 }}>
            {[i.sourceLabel, i.unit, when(i.createdAt)].filter(Boolean).join(" · ")}
          </div>
          {typeof i.detail.issue === "string" && i.detail.issue && <div style={{ fontSize: 13, marginTop: 6 }}>{i.detail.issue}</div>}
          {p.canEdit && i.status === "awaiting_approval" && (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <button type="button" style={btn(true)} disabled={p.busyId === i.id} onClick={() => p.onStatus(i.id, "approved")}>Approve</button>
              <button type="button" style={btn()} disabled={p.busyId === i.id} onClick={() => p.onStatus(i.id, "denied")}>Deny</button>
            </div>
          )}
          {p.canEdit && i.open && i.status !== "awaiting_approval" && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {i.status !== "planned" && <button type="button" style={btn()} disabled={p.busyId === i.id} onClick={() => p.onStatus(i.id, "planned")}>Planned</button>}
              <button type="button" style={btn(true)} disabled={p.busyId === i.id} onClick={() => p.onStatus(i.id, "done")}>Done</button>
              <button type="button" style={btn()} disabled={p.busyId === i.id} onClick={() => p.onStatus(i.id, "cancelled")}>Cancel</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
