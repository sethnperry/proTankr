"use client";
// app/planner/home/DashboardSheets.tsx
//
// The two windows behind the top chips: every expiration grouped by type, and
// every load dispatch has planned (run one first, out of order if needed).

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { EXPIRY_COLOR, type ExpiryState } from "@/lib/expiry";
import { DispatchedCard, type DispatchedItem } from "./DispatchedCard";
import { useDashLook } from "./dashLook";

export type ExpRow = { key: string; name: string; sub?: string | null; detail: string; state: ExpiryState };
export type ExpGroup = { title: string; rows: ExpRow[]; more?: { label: string; onClick: () => void } };

export function ExpirationsSheet({ open, groups, onClose, onManage }: { open: boolean; groups: ExpGroup[]; onClose: () => void; onManage: () => void }) {
  const L = useDashLook();
  const shown = groups.filter((g) => g.rows.length > 0);
  return (
    <FullscreenModal open={open} title="Expirations" onClose={onClose} footer={null}>
      {shown.length === 0 && <div style={{ ...L.secondary, padding: 14, color: L.muted, fontSize: 14 }}>Nothing expired or due in the next 30 days.</div>}
      {shown.map((g) => (
        <div key={g.title} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>{g.title}</span>
            {g.more && (
              <button type="button" onClick={g.more.onClick} style={{ marginLeft: "auto", background: "none", border: "none", color: "#93c5fd", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{g.more.label} ›</button>
            )}
          </div>
          <div style={{ ...L.secondary, overflow: "hidden" }}>
            {g.rows.map((r, i) => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderTop: i === 0 ? "none" : `1px solid ${L.hairline}` }}>
                <span aria-hidden style={{ width: 8, height: 8, background: EXPIRY_COLOR[r.state], flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{r.name}</span>
                  {r.sub && <span style={{ display: "block", fontSize: 12, color: L.muted }}>{r.sub}</span>}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: EXPIRY_COLOR[r.state], textAlign: "right" }}>{r.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <button type="button" onClick={onManage} className="dash-press"
        style={{ ...L.secondary, width: "100%", padding: "12px", color: "#fff", fontWeight: 800, cursor: "pointer", textAlign: "center" }}>
        Postpone or review all
      </button>
    </FullscreenModal>
  );
}

export function LoadsSheet({ open, items, onClose, onRun }: { open: boolean; items: DispatchedItem[]; onClose: () => void; onRun?: (tripId: string) => void }) {
  return (
    <FullscreenModal open={open} title={`Dispatched loads (${items.length})`} onClose={onClose} footer={null}>
      <DispatchedCard items={items} onRun={onRun} />
    </FullscreenModal>
  );
}
