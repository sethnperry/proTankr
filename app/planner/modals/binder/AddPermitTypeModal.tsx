"use client";
// app/planner/modals/binder/AddPermitTypeModal.tsx
//
// Part of the Binder (equipment file) dialog.

import React, { useMemo } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import type { PermitType, UnitKind } from "./types";
import { PERMIT_SUGGESTIONS } from "./helpers";

export function AddPermitTypeModal({
  open,
  onClose,
  unit,
  existingTypes,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  unit: UnitKind;
  existingTypes: PermitType[];
  onPick: (name: string) => void;
}) {
  const suggestions = useMemo(() => {
    const existingNames = new Set(
      existingTypes.filter((t) => t.applies_to === unit || t.applies_to === "both").map((t) => t.name.trim().toLowerCase()),
    );
    return PERMIT_SUGGESTIONS[unit].filter((n) => !existingNames.has(n.toLowerCase()));
  }, [existingTypes, unit]);

  const rowStyle: React.CSSProperties = {
    textAlign: "left" as const,
    padding: "12px 14px",
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.03)",
    color: "white",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  };

  return (
    <FullscreenModal open={open} onClose={onClose} title="Add Permit Type" footer={null}>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 4 }}>Pick a common permit, or add a custom one.</div>
        {suggestions.map((name) => (
          <button key={name} type="button" onClick={() => onPick(name)} style={rowStyle}>
            {name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPick("")}
          style={{
            textAlign: "left" as const,
            padding: "12px 14px",
            borderRadius: 2,
            border: "1px dashed rgba(255,255,255,0.18)",
            background: "transparent",
            color: "rgba(255,255,255,0.55)",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            width: "100%",
          }}
        >
          + Add custom
        </button>
      </div>
    </FullscreenModal>
  );
}

// ─── Unit info row (year/make/model/VIN/plate/notes) ────────────────────────
// Collapsed, this is just the section header ("Truck · 25184"). Tapping it
// expands a read-only summary of the unit's own details, with a bottom Edit
// button that swaps the summary for editable fields (Save/Cancel) --
// mirroring the same expand-then-edit convention as the permit rows below.
