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
export type ExpGroup = { title: string; rows: ExpRow[]; more?: { label: string; onClick: () => void }; onOpen?: () => void };

/** The one expirations list, shared by the Driver and Dispatch dashboards. Both feed it groups of rows
 *  colored by lib/expiry.ts (30 days yellow, 7 orange, expired red). `note` says what it is filtered to. */
export function ExpirationsSheet({ open, groups, onClose, title = "Expirations", note, loading }: { open: boolean; groups: ExpGroup[]; onClose: () => void; title?: string; note?: string | null; loading?: boolean }) {
  const L = useDashLook();
  const shown = groups.filter((g) => g.rows.length > 0);
  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      {note && <div style={{ fontSize: 12, color: L.muted, marginBottom: 10 }}>{note}</div>}
      {loading && shown.length === 0 && <div style={{ fontSize: 14, color: L.muted }}>Loading…</div>}
      {!loading && shown.length === 0 && <div style={{ ...L.secondary, padding: 14, color: L.muted, fontSize: 14 }}>Nothing expired or due in the next 30 days.</div>}
      {shown.map((g) => (
        <div key={g.title} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
            {g.onOpen ? (
              <button type="button" onClick={g.onOpen} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff" }}>{g.title} ›</button>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>{g.title}</span>
            )}
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
