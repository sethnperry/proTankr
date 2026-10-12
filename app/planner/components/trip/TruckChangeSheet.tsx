"use client";
// app/planner/components/trip/TruckChangeSheet.tsx
//
// Shown on the Driver Dashboard when the trip's loaded trailer is now behind
// a different truck. Records the swap on the trip (truck_change event, trip
// moves to the new truck) and shows the gross recomputed with the new tare.

import React, { useEffect, useState } from "react";
import { fieldInput, fieldLabel, muted, numOrNull, primaryBtn } from "./tripUi";

const LEGAL = 80000;

export type TruckChangeView = {
  fromName: string | null;
  toName: string | null;
  trailerName: string | null;
  productLbs: number;
  missing: number;      // compartments that couldn't be weighed
  fromTare: number | null;
  toTare: number | null;
  target: number | null;
  grossBefore: number | null;
  grossAfter: number | null;
};

const lbs = (n: number | null) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} lbs`);
const grossColor = (g: number | null, target: number | null) =>
  g == null ? "#fff" : g > LEGAL ? "#f87171" : target != null && g > target ? "#fbbf24" : "#4ade80";

export function TruckChangeSheet({ open, view, busy, onRecord, onClose }: {
  open: boolean;
  view: TruckChangeView | null;
  busy: boolean;
  onRecord: (fromOdometer: number | null, toOdometer: number | null) => void;
  onClose: () => void;
}) {
  const [fromOdo, setFromOdo] = useState("");
  const [toOdo, setToOdo] = useState("");
  useEffect(() => { if (open) { setFromOdo(""); setToOdo(""); } }, [open]);
  if (!open || !view) return null;
  const from = view.fromName ? `Truck ${view.fromName}` : "the old truck";
  const to = view.toName ? `Truck ${view.toName}` : "the new truck";
  const diff = view.grossAfter != null && view.grossBefore != null ? view.grossAfter - view.grossBefore : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "#0b0b0b",
        borderTop: "1px solid rgba(255,255,255,0.12)", borderRadius: "16px 16px 0 0",
        padding: "18px 16px calc(env(safe-area-inset-bottom,0px) + 18px)", color: "#fff",
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Truck changed</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 14 }}>
          {view.trailerName ? `Trailer ${view.trailerName}` : "The trailer"} is loaded and now behind <b>{to}</b> (was {from}).
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 14 }}>
          <Line label="Product on board" value={lbs(view.productLbs)} />
          <Line label={`${to} tare`} value={lbs(view.toTare)} />
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", margin: "8px 0" }} />
          <Line label="New gross" value={lbs(view.grossAfter)} color={grossColor(view.grossAfter, view.target)} bold />
          {view.grossBefore != null && (
            <Line label={`With ${from}`} value={`${lbs(view.grossBefore)}${diff != null ? ` (${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString("en-US")})` : ""}`} />
          )}
          {view.target != null && <Line label="Target" value={lbs(view.target)} />}
          {view.toTare == null && (
            <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 8 }}>No tare on file for this truck and trailer. Couple them in Equipment to set it.</div>
          )}
          {view.grossAfter != null && view.grossAfter > LEGAL && (
            <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>
              Over the {LEGAL.toLocaleString("en-US")} lb legal limit by {(view.grossAfter - LEGAL).toLocaleString("en-US")} lbs with this truck.
            </div>
          )}
          {view.missing > 0 && (
            <div style={{ fontSize: 12, color: muted, marginTop: 8 }}>
              {view.missing} compartment{view.missing === 1 ? "" : "s"} had no API or temp logged and {view.missing === 1 ? "isn't" : "aren't"} counted.
            </div>
          )}
        </div>

        <div style={fieldLabel}>{from} odometer at the swap</div>
        <input inputMode="decimal" value={fromOdo} onChange={(e) => setFromOdo(e.target.value)} placeholder="Optional" style={{ ...fieldInput, marginBottom: 10 }} />
        <div style={fieldLabel}>{to} odometer at the swap</div>
        <input inputMode="decimal" value={toOdo} onChange={(e) => setToOdo(e.target.value)} placeholder="Optional" style={{ ...fieldInput, marginBottom: 6 }} />
        <div style={{ fontSize: 12, color: muted, marginBottom: 14 }}>Both are needed for the PTD's total miles across the two trucks.</div>

        <button type="button" disabled={busy} onClick={() => onRecord(numOrNull(fromOdo), numOrNull(toOdo))} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Record Truck Change"}
        </button>
        <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 8, padding: "10px 0", border: "none", background: "transparent", color: muted, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Not Now
        </button>
      </div>
    </div>
  );
}

function Line({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" }}>
      <span style={{ color: muted }}>{label}</span>
      <span style={{ color: color ?? "#fff", fontWeight: bold ? 800 : 600 }}>{value}</span>
    </div>
  );
}
