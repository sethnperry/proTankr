"use client";
// app/planner/components/StaleApiOverlay.tsx
//
// Shown when the driver taps LOAD and one or more planned products have a
// stale (or missing) API reading at this terminal. Lower API = denser =
// heavier = fewer safe gallons, so the two "assume heavier" choices make the
// plan solve conservatively before the driver ever pulls up to the rack
// (see CLAUDE.md: "if diesel ranges 33-38 we use 33").
//
// Good / Better / Best, per explicit direction:
//   Safest  -> assume each product's published heaviest (products.api_min)
//   Safe    -> assume the heaviest THIS TERMINAL has seen (min_api_observed)
//   Ignore  -> proceed with the last-known reading (Not Safe)
//
// Same graphite bottom-sheet treatment as CancelLoadSheet, for continuity.

import React from "react";
import { GRAPHITE, GRAPHITE_DARKER , SURFACE } from "../theme";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

export type StaleProduct = { productId: string; name: string; dotColor: string };

type Props = {
  open: boolean;
  products: StaleProduct[];
  onSafest: () => void;
  onSafe: () => void;
  onIgnore: () => void;
  onCancel: () => void;
};

const choiceStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2,
  border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
  color: "rgba(255,255,255,0.92)", cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};
const titleLine: React.CSSProperties = { fontSize: 15, fontWeight: 800 };
const subLine: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginTop: 2 };

export default function StaleApiOverlay({ open, products, onSafest, onSafe, onIgnore, onCancel }: Props) {
  if (!open) return null;

  const many = products.length > 1;

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 10450, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 480,
          background: SURFACE,
          borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.1)",
          padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
          API reading{many ? "s" : ""} may be out of date
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 12, lineHeight: 1.4 }}>
          {many ? "These products haven't" : "This product hasn't"} been updated at this terminal
          lately. Assuming a heavier product keeps you under weight.
        </div>

        {/* Which products are stale, with their dots */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {products.map((p) => (
            <span key={p.productId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.dotColor, flexShrink: 0 }} />
              {p.name}
            </span>
          ))}
        </div>

        <button type="button" style={choiceStyle} onClick={onSafest}>
          <div style={titleLine}>Safest</div>
          <div style={subLine}>Assume the published heaviest for {many ? "each" : "this"} product</div>
        </button>
        <button type="button" style={choiceStyle} onClick={onSafe}>
          <div style={titleLine}>Safe</div>
          <div style={subLine}>Assume the heaviest this terminal has seen</div>
        </button>
        <button type="button" style={{ ...choiceStyle, border: "1px solid rgba(248,113,113,0.35)" }} onClick={onIgnore}>
          <div style={{ ...titleLine, color: "#f87171" }}>Ignore</div>
          <div style={subLine}>Use the last-known reading (not safe)</div>
        </button>

        <button
          type="button"
          onClick={onCancel}
          style={{ width: "100%", padding: "12px 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
