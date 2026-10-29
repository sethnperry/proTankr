"use client";
// app/planner/dispatch/LiveSheet.tsx
//
// A list behind one of the Live dashboard's chips (En route, On site, Delayed): the loads in that state,
// grouped, with a search box (driver, truck, trailer, rack or store, order number). Tap a row to open it.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { filterLive, KIND_LABEL, type LiveKind, type LiveRow } from "@/lib/dispatch/liveGroups";
import { CardBusy, busyProps } from "@/lib/ui/pending";

const dur = (m: number | null) => (m == null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);

export function LiveSheet({ open, title, rows, kinds, onClose, onOpenTrip, openingId }: {
  open: boolean;
  title: string;
  rows: LiveRow[];
  /** The groups to show, in order. */
  kinds: LiveKind[];
  onClose: () => void;
  onOpenTrip: (tripId: string) => void;
  openingId?: string | null;
}) {
  const L = useDashLook();
  const [q, setQ] = useState("");
  const shown = useMemo(() => filterLive(rows, q), [rows, q]);
  return (
    <FullscreenModal open={open} title={`${title} (${rows.length})`} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver, truck, rack, store or order"
        style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 12 }} />
      {rows.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>Nothing here right now.</div>}
      {rows.length > 0 && shown.length === 0 && <div style={{ fontSize: 14, color: L.muted }}>No matches.</div>}
      {kinds.map((k) => {
        const list = shown.filter((r) => r.kind === k);
        if (!list.length) return null;
        return (
          <div key={k} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, margin: "2px 0 8px" }}>{KIND_LABEL[k]} · {list.length}</div>
            {list.map((r) => (
              <button key={r.tripId} type="button" onClick={() => onOpenTrip(r.tripId)} className="dash-press" {...busyProps(openingId === r.tripId)}
                style={{ ...L.secondary, position: "relative", display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "10px 12px", marginBottom: 6, cursor: "pointer", borderColor: r.delayed ? `${EXPIRY_COLOR.expiring}88` : undefined }}>
                <CardBusy on={openingId === r.tripId} />
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.driverName}{r.truckName && <span style={{ fontWeight: 600, color: L.muted }}> · {r.truckName}</span>}
                  </span>
                  {r.minutes != null && (
                    <span className="dash-num" style={{ fontSize: 13, fontWeight: 800, color: r.delayed ? EXPIRY_COLOR.expiring : L.muted }}>{dur(r.minutes)}</span>
                  )}
                </div>
                <div style={{ marginTop: 3, fontSize: 13, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.where}{r.place && <span style={{ color: L.muted }}> · {r.place}</span>}
                </div>
                {r.orders.length > 0 && <div style={{ marginTop: 2, fontSize: 12, color: L.faint }}>Order {r.orders.join(", ")}{r.trailerName ? ` · Trailer ${r.trailerName}` : ""}</div>}
              </button>
            ))}
          </div>
        );
      })}
    </FullscreenModal>
  );
}
