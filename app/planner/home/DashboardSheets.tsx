"use client";
// app/planner/home/DashboardSheets.tsx
//
// The two windows behind the top chips: every expiration grouped by type, and
// every load dispatch has planned (run one first, out of order if needed).

import { DispatchedTripCard } from "../components/trip/DispatchedTripCard";
import React, { useState } from "react";
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
  const [copied, setCopied] = useState(false);
  const [shareErr, setShareErr] = useState("");
  // A plain-text report of what's on screen, to copy or send.
  const report = [title, ...(note ? [note] : []), "",
    ...shown.flatMap((g) => [g.title.toUpperCase(), ...g.rows.map((r) => `- ${r.name}${r.sub ? ` (${r.sub})` : ""}: ${r.detail}`), ""])].join("\n").trim();
  const copy = async () => {
    setShareErr("");
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setShareErr("Could not copy to the clipboard."); }
  };
  const share = async () => {
    setShareErr("");
    if (navigator.share) { try { await navigator.share({ title, text: report }); } catch { /* cancelled */ } }
    else window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(report)}`);
  };
  const shareBtn: React.CSSProperties = { flex: 1, padding: "13px 0", border: `1px solid ${L.hairline}`, background: "#050505", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" };
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
      {shown.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void copy()} style={shareBtn}>{copied ? "✓ Copied" : "Copy"}</button>
            <button type="button" onClick={() => void share()} style={shareBtn}>Share / Email</button>
          </div>
          {shareErr && <div style={{ marginTop: 6, fontSize: 12, color: "#f87171" }}>{shareErr}</div>}
        </div>
      )}
    </FullscreenModal>
  );
}

export function LoadsSheet({ open, items, moves = [], onClose, onRun, onSwap, onEdit }: { open: boolean; items: DispatchedItem[]; moves?: { id: string; text: string; when: string | null }[]; onClose: () => void; onRun?: (tripId: string) => void; onSwap?: (a: string, b: string) => void; onEdit?: (tripId: string) => void }) {
  return (
    <FullscreenModal open={open} title={`Trips (${items.length + moves.length})`} onClose={onClose} footer={null}>
      {items.length + moves.length === 0 && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>Nothing planned yet. Dispatch sends loads and moves here.</div>}
      {items.map((it, i) => (
        <DispatchedTripCard key={it.trip.trip_id} trip={it.trip} pickups={it.pickups ?? []} deliveries={it.deliveries ?? []}
          onOpen={onEdit ? () => onEdit(it.trip.trip_id) : undefined}
          footer={(onRun || (onSwap && items.length > 1)) ? (
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              {onRun && (
                <button type="button" onClick={() => onRun(it.trip.trip_id)}
                  style={{ flex: 1, border: i === 0 ? "none" : "1px solid rgba(255,255,255,0.3)", background: i === 0 ? "#fff" : "transparent", color: i === 0 ? "#000" : "#fff", padding: "10px 12px", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
                  {i === 0 ? "Run this load" : "Run this load first"}
                </button>
              )}
              {onSwap && items.length > 1 && (["Run earlier", "Run later"] as const).map((lab) => {
                const other = lab === "Run earlier" ? items[i - 1] : items[i + 1];
                return (
                  <button key={lab} type="button" aria-label={lab} disabled={!other} onClick={() => other && onSwap(it.trip.trip_id, other.trip.trip_id)}
                    style={{ border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: other ? "#fff" : "rgba(255,255,255,0.2)", cursor: other ? "pointer" : "default", fontSize: 14, padding: "0 12px" }}>
                    {lab === "Run earlier" ? "▲" : "▼"}
                  </button>
                );
              })}
            </div>
          ) : undefined} />
      ))}
      {moves.map((m) => (
        <div key={m.id} style={{ border: "1px solid rgba(255,255,255,0.14)", padding: "12px 14px", marginTop: 8, background: "#121213" }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{m.text}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Empty move{m.when ? ` · ${m.when}` : ""}. Start it from the big button.</div>
        </div>
      ))}
    </FullscreenModal>
  );
}
