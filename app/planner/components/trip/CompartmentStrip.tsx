"use client";
// app/planner/components/trip/CompartmentStrip.tsx
//
// The trailer on one line: one segment per compartment, widths in proportion
// to each compartment's size, ordered like the Planner (C1 on the right).
// A filled segment is the product's color; an empty one is an outline. An
// empty compartment with a known last product shows that residue as a
// scatter of dots in the product's color (vapor left behind).
// A reminder of what's in which compartment, to avoid cross-drops.

import React from "react";

export type StripSlot = {
  comp: number;
  size: number;          // compartment size (gallons); sets the width
  color: string | null;  // product color, null = empty
  residue?: string | null; // empty but last held this product (its color)
  title?: string;        // tooltip
  selected?: boolean;    // outlined in white (picking compartments)
  onClick?: () => void;
};

export function CompartmentStrip({ slots, height = 12, gap = 3 }: { slots: StripSlot[]; height?: number; gap?: number }) {
  const ordered = [...slots].sort((a, b) => b.comp - a.comp);
  const total = ordered.reduce((t, s) => t + (s.size > 0 ? s.size : 1), 0) || 1;
  return (
    <div style={{ display: "flex", gap, width: "100%", alignItems: "stretch" }}>
      {ordered.map((s) => {
        const w = ((s.size > 0 ? s.size : 1) / total) * 100;
        const style: React.CSSProperties = {
          flex: `0 0 calc(${w.toFixed(4)}% - ${(((ordered.length - 1) * gap) / ordered.length).toFixed(2)}px)`,
          height,
          borderRadius: 3,
          background: s.color ?? (s.residue ? residueDots(s.residue) : "transparent"),
          border: s.selected
            ? "2px solid #fff"
            : s.color ? "1px solid rgba(0,0,0,0.25)"
            : s.residue ? `1px dashed ${withAlpha(s.residue, 0.55)}` : "1px dashed rgba(255,255,255,0.35)",
          boxSizing: "border-box",
          padding: 0,
          cursor: s.onClick ? "pointer" : "default",
        };
        return s.onClick
          ? <button key={s.comp} type="button" title={s.title} aria-label={s.title ?? `C${s.comp}`} onClick={s.onClick} style={style} />
          : <div key={s.comp} title={s.title} style={style} />;
      })}
    </div>
  );
}

// "#rrggbb" → rgba with alpha; anything else is returned as is.
function withAlpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Two offset dot grids in the product color: reads as vapor, not paint.
function residueDots(color: string): string {
  const a = withAlpha(color, 0.75);
  const b = withAlpha(color, 0.4);
  return `radial-gradient(circle, ${a} 0 0.9px, transparent 1.3px) 0 0 / 6px 6px, ` +
    `radial-gradient(circle, ${b} 0 0.8px, transparent 1.2px) 3px 3px / 6px 6px`;
}
