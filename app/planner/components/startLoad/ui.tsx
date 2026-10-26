"use client";
// app/planner/components/startLoad/ui.tsx
//
// Part of StartLoadSheet.tsx: shared styles and the report-line button.

import React from "react";

export const addBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.25)",
  background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

export const hair = "1px solid rgba(255,255,255,0.08)";
export const lineLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
  color: "rgba(255,255,255,0.45)", flexShrink: 0, width: 92,
};
export const removeBtn: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.45)",
  fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 700,
};

// One line of the report: label on the left, the value (tap to change) on the right.
export function Line({ label, value, onTap, missing, sub, last }: {
  label: string; value: string | null; onTap: () => void; missing?: boolean; sub?: string | null; last?: boolean;
}) {
  return (
    <button type="button" onClick={onTap}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 0", border: "none", borderBottom: last ? "none" : hair, background: "transparent", cursor: "pointer", textAlign: "left", color: "#fff" }}>
      <span style={lineLabel}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value ? "#fff" : missing ? "#fbbf24" : "rgba(255,255,255,0.4)" }}>
          {value || (missing ? "Add" : "None")}
        </span>
        {sub && <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
}

