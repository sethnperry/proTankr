"use client";
// app/planner/components/trip/CompartmentStrip.tsx
//
// The trailer on one line: one segment per compartment, widths in proportion
// to each compartment's size, ordered like the Planner (C1 on the right).
// A filled segment is the product's color; an empty one is an outline. An
// empty compartment with a known last product is outlined in that product's
// color (residue left behind).
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
          background: s.color ?? "transparent",
          border: s.selected
            ? "2px solid #fff"
            : s.color ? "1px solid rgba(0,0,0,0.25)"
            : s.residue ? `1.5px solid ${s.residue}` : "1px dashed rgba(255,255,255,0.35)",
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
