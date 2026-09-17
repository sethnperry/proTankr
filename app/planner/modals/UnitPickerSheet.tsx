"use client";
// app/planner/modals/UnitPickerSheet.tsx
//
// Small themed "Truck or Trailer?" picker -- used by SoloEquipmentModal.tsx's
// Edit button (pick which unit's Binder to open) and reusable wherever else
// a "pick which unit" step is needed (e.g. EquipmentModal.tsx's fleet-tier
// Edit flow, a later phase). Styled to match the confirm-dialog pattern this
// app already uses (commandeer/remove confirmations in SoloEquipmentModal.tsx)
// rather than a separate design system, since that's what "match our theme"
// means in the context this sheet actually appears in.
//
// The caller is responsible for skipping this entirely when only one unit
// is currently selected -- see SoloEquipmentModal.tsx's openEdit().

import React from "react";

export default function UnitPickerSheet({
  open, truckName, trailerName, onPickTruck, onPickTrailer, onCancel,
  title = "Edit which unit?",
  subtitle = "Opens that unit's file -- documents, permits, and identity fields.",
}: {
  open: boolean;
  truckName: string | null;
  trailerName: string | null;
  onPickTruck: () => void;
  onPickTrailer: () => void;
  onCancel: () => void;
  /** Overridable so other "pick which unit" flows (e.g. the Update Status
   *  button) can reuse this same sheet with their own copy, defaulting to
   *  the original Edit-flow text so that call site is unaffected. */
  title?: string;
  subtitle?: string;
}) {
  if (!open) return null;

  const optionStyle: React.CSSProperties = {
    width: "100%", padding: "16px 18px", borderRadius: 8, marginBottom: 10,
    border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)",
    color: "#fff", fontSize: 16, fontWeight: 800, textAlign: "left" as const, cursor: "pointer",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#151515", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: 20, maxWidth: 360, width: "100%" }}>
        <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 16 }}>
          {subtitle}
        </div>

        {truckName && (
          <button type="button" onClick={onPickTruck} style={optionStyle}>
            Truck · {truckName}
          </button>
        )}
        {trailerName && (
          <button type="button" onClick={onPickTrailer} style={optionStyle}>
            Trailer · {trailerName}
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "#fff", cursor: "pointer", marginTop: 4 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
