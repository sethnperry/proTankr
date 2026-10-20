"use client";
// app/planner/dispatch/DispatchedBoard.tsx
//
// Loads dispatch has sent that the driver hasn't begun. Cancel takes one back.

import React, { useState } from "react";
import { useDashLook } from "../home/dashLook";
import type { DispatchedTrip } from "@/lib/dispatch/useDispatchData";

const when = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
};

export function DispatchedBoard({ trips, driverName, locationName, supplierName, onCancel, onSwap }: {
  trips: DispatchedTrip[];
  driverName: (id: string) => string;
  locationName: (id: string | null) => string;
  supplierName: (id: string | null) => string | null;
  onCancel: (tripId: string) => Promise<string | null>;
  onSwap: (a: DispatchedTrip, b: DispatchedTrip) => Promise<string | null>;
}) {
  const L = useDashLook();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (trips.length === 0) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      {err && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>{err}</div>}
      {trips.map((t, idx) => {
        // Neighbours for the same driver: the run order is per driver.
        const mine = trips.filter((x) => x.driver_id === t.driver_id);
        const at = mine.findIndex((x) => x.trip_id === t.trip_id);
        const up = at > 0 ? mine[at - 1] : null;
        const down = at < mine.length - 1 ? mine[at + 1] : null;
        const arrow = (label: string, other: DispatchedTrip | null) => (
          <button type="button" aria-label={label} disabled={!other} onClick={async () => { if (other) setErr(await onSwap(t, other)); }}
            style={{ border: "none", background: "transparent", color: other ? "#fff" : "rgba(255,255,255,0.2)", cursor: other ? "pointer" : "default", fontSize: 14, padding: "0 4px" }}>{label === "Run earlier" ? "▲" : "▼"}</button>
        );
        void idx;
        return (
        <div key={t.trip_id} style={{ ...L.secondary, padding: "10px 12px", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driverName(t.driver_id)}</span>
            {mine.length > 1 && <span>{arrow("Run earlier", up)}{arrow("Run later", down)}</span>}
            <span className="dash-num" style={{ fontSize: 12, color: L.muted }}>{when(t.planned_start_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{t.terminal ?? "Terminal"} → {locationName(t.locationId)}</div>
          <div className="dash-num" style={{ fontSize: 12, color: L.muted, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>Order {t.order ?? "—"}</span>
            {supplierName(t.supplier_id) && <span>{supplierName(t.supplier_id)}</span>}
            <span style={{ marginLeft: "auto" }}>
              {confirm === t.trip_id ? (
                <>
                  <button type="button" onClick={async () => { const e = await onCancel(t.trip_id); setConfirm(null); setErr(e); }} style={{ border: "none", background: "transparent", color: "#f87171", fontWeight: 800, cursor: "pointer", fontSize: 12 }}>Cancel it</button>
                  <button type="button" onClick={() => setConfirm(null)} style={{ border: "none", background: "transparent", color: L.muted, cursor: "pointer", fontSize: 12 }}>Keep</button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirm(t.trip_id)} style={{ border: "none", background: "transparent", color: L.muted, cursor: "pointer", fontSize: 12 }}>Cancel dispatch</button>
              )}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}
