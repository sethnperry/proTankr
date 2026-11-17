"use client";
// app/planner/components/CodeDash.tsx
//
// How a trailer's compartments are shown everywhere (the trip card, the fleet and site boards, the equipment
// board, a dispatched load): the product code in its color for a loaded compartment, a dash for an empty one
// ("D2 / – / D2"). A dash left in a product's color means that is what the compartment last held (residue); a gray
// dash is new or washed. C1 is on the right, like the Planner.

import React from "react";

export type CodeDashItem = { comp: number; kind: "loaded" | "residue" | "empty"; code?: string | null; color?: string | null };

const MUTED = "rgba(255,255,255,0.4)";

export function CodeDash({ items, fontSize = 14 }: { items: CodeDashItem[]; fontSize?: number }) {
  if (!items.length) return null;
  const ordered = [...items].sort((a, b) => b.comp - a.comp);
  return (
    <span className="dash-num" style={{ display: "inline-flex", alignItems: "baseline", gap: 5, fontSize, lineHeight: 1.2, fontWeight: 800, whiteSpace: "nowrap" }}>
      {ordered.map((g, i) => (
        <React.Fragment key={g.comp}>
          {i > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>/</span>}
          {g.kind === "loaded"
            ? <span style={{ color: g.color ?? "#fff" }}>{g.code || "▪"}</span>
            : <span style={{ color: g.kind === "residue" ? g.color ?? MUTED : MUTED }}>––</span>}
        </React.Fragment>
      ))}
    </span>
  );
}

export type CodeDashPickItem = CodeDashItem & { selected?: boolean; title?: string; onClick?: () => void };

/** The same line with each compartment as a tap target (picking compartments): selected ones are outlined in white. */
export function CodeDashPick({ items, fontSize = 22 }: { items: CodeDashPickItem[]; fontSize?: number }) {
  if (!items.length) return null;
  const ordered = [...items].sort((a, b) => b.comp - a.comp);
  return (
    <span className="dash-num" style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize, fontWeight: 800 }}>
      {ordered.map((g, i) => {
        const style: React.CSSProperties = {
          minWidth: 52, padding: "10px 8px", textAlign: "center", fontSize, fontWeight: 800, lineHeight: 1.1, borderRadius: 2, background: "transparent",
          border: g.selected ? "2px solid #fff" : g.onClick ? "1px dashed rgba(255,255,255,0.35)" : "1px solid transparent",
          color: g.kind === "loaded" ? g.color ?? "#fff" : g.kind === "residue" ? g.color ?? MUTED : MUTED,
          cursor: g.onClick ? "pointer" : "default",
        };
        const label = g.kind === "loaded" ? g.code || "▪" : "––";
        return (
          <React.Fragment key={g.comp}>
            {i > 0 && <span style={{ color: MUTED, fontWeight: 600 }}>/</span>}
            {g.onClick
              ? <button type="button" title={g.title} aria-label={g.title ?? `C${g.comp}`} onClick={g.onClick} style={style}>{label}</button>
              : <span title={g.title} style={style}>{label}</span>}
          </React.Fragment>
        );
      })}
    </span>
  );
}
