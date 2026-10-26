"use client";
// app/planner/modals/binder/CompartmentRowItem.tsx
//
// Part of the Binder (equipment file) dialog.

import type { CompartmentRow } from "./types";
import { labelStyle } from "./styles";

export function CompartmentRowItem({
  comp,
  isExpanded,
  onToggleExpand,
}: {
  comp: CompartmentRow;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const effectiveCap = comp.cap_gallons ?? comp.max_gallons;

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
      <div onClick={onToggleExpand} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 2px", cursor: "pointer" }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Comp {comp.comp_number}</span>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{Math.round(effectiveCap).toLocaleString()} gal cap</span>
      </div>
      {isExpanded && (
        <div style={{ padding: "4px 2px 14px" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Total volume (informational only)</label>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>{Math.round(comp.max_gallons).toLocaleString()} gal</div>
          </div>
          <div>
            <label style={labelStyle}>Cap (overflow prevention -- edit in Equipment)</label>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>{Math.round(effectiveCap).toLocaleString()} gal</div>
          </div>
        </div>
      )}
    </div>
  );
}
