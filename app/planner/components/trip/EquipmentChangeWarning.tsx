"use client";
// app/planner/components/trip/EquipmentChangeWarning.tsx
//
// Shown before the equipment picker opens while a trip has product on board
// or a load in progress. The load belongs to the trailer: swapping trucks
// changes tare (so the gross weight changes), and swapping trailers leaves
// the load on the old trailer.

import React from "react";
import { muted, primaryBtn } from "./tripUi";

export function EquipmentChangeWarning({ open, trailerName, truckName, loaded, onContinue, onClose }: {
  open: boolean;
  trailerName: string | null;
  truckName: string | null;
  loaded: boolean; // product on board (vs. a load still being planned)
  onContinue: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const trailer = trailerName ? `Trailer ${trailerName}` : "the trailer";
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520, background: "#0b0b0b", borderTop: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "16px 16px 0 0", padding: "18px 16px calc(env(safe-area-inset-bottom,0px) + 18px)", color: "#fff",
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 800, color: "#fbbf24", marginBottom: 10 }}>Trip in progress</div>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,0.85)" }}>
          {loaded
            ? <>The load stays with <b>{trailer}</b>.</>
            : <>This trip&apos;s load is planned on <b>{trailer}</b>{truckName ? <> behind <b>Truck {truckName}</b></> : null}.</>}
        </div>
        <ul style={{ fontSize: 13, lineHeight: 1.5, color: muted, paddingLeft: 18, margin: "10px 0 16px" }}>
          <li>A different truck has a different tare, so the gross weight changes. After you pick it, record the truck change on the Driver Dashboard to see the new gross.</li>
          <li>Dropping {trailer} leaves the load with it. Whoever picks it up delivers it.</li>
        </ul>
        <button type="button" onClick={onContinue} style={{ ...primaryBtn, width: "100%" }}>Change Equipment</button>
        <button
          type="button"
          onClick={onClose}
          style={{ width: "100%", marginTop: 8, padding: "10px 0", border: "none", background: "transparent", color: muted, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          Keep Current Equipment
        </button>
      </div>
    </div>
  );
}
