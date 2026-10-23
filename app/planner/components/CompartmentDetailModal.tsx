"use client";
// app/planner/components/CompartmentDetailModal.tsx
//
// Opens when a compartment is tapped on the Plan page: one compartment drawn
// large, with the same drag handle for the cap (bounded to the trailer's
// configured cap, never above it), the planned gallons underneath, and
// Change product / Close.

import React, { useRef, useState } from "react";
import { HEADSPACE_SCALE } from "../utils/headspace";

export default function CompartmentDetailModal({
  open, compNumber, trueMax, persistedCap, capGallons, plannedGallons, hasOverride,
  productLabel, code, color, isEmpty, onCapChange, onResetCap, onChangeProduct, onClose,
}: {
  open: boolean;
  compNumber: number | null;
  trueMax: number;
  persistedCap: number;
  capGallons: number;
  plannedGallons: number;
  hasOverride: boolean;
  productLabel: string;
  code: string;
  color: string;
  isEmpty: boolean;
  onCapChange: (gallons: number) => void;
  onResetCap: () => void;
  onChangeProduct: () => void;
  onClose: () => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  if (!open || compNumber == null) return null;

  const scaledMax = Math.max(1, trueMax * HEADSPACE_SCALE);
  const fillPct = Math.max(0, Math.min(1, Math.min(plannedGallons, capGallons) / scaledMax));
  const capPct = Math.max(0, Math.min(1, capGallons / scaledMax));
  const fullCapPct = Math.max(0, Math.min(1, persistedCap / scaledMax));

  const setFromY = (clientY: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    onCapChange(Math.max(0, Math.min(persistedCap, Math.round(frac * scaledMax))));
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Compartment ${compNumber}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, padding: 18, display: "grid", gap: 14, color: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Compartment {compNumber}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: isEmpty ? "rgba(255,255,255,0.35)" : color }}>{code}</div>
        </div>

        <div style={{ display: "flex", justifyContent: "center" }}>
          <div ref={barRef} style={{ position: "relative", width: 132, height: 300, background: "rgba(255,255,255,0.06)", touchAction: "none" }}>
            <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
              {capPct < 0.999 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: `${(1 - capPct) * 100}%`, background: "rgba(0,0,0,0.30)", borderBottom: "1px dashed rgba(255,160,0,0.5)" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${fillPct * 100}%`, background: isEmpty ? "rgba(255,255,255,0.08)" : color, transition: dragging ? "none" : "height 250ms ease" }} />
            </div>
            {/* Where the trailer's configured cap sits (the most the handle can reach). */}
            <div aria-hidden style={{ position: "absolute", left: -6, right: -6, top: `${(1 - fullCapPct) * 100}%`, borderTop: "1px solid rgba(255,255,255,0.22)" }} />
            <div
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); setFromY(e.clientY); }}
              onPointerMove={(e) => { if (dragging) setFromY(e.clientY); }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              style={{ position: "absolute", left: "50%", transform: "translate(-50%,-50%)", top: `max(12px, ${(1 - capPct) * 100}%)`, width: 90, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "ns-resize", touchAction: "none", zIndex: 3 }}
            >
              <div style={{ width: 64, height: 6, borderRadius: 3, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }} />
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
            {plannedGallons > 0 ? Math.round(plannedGallons).toLocaleString() : "—"} <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.5)" }}>gal</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            {productLabel}{!isEmpty ? " · " : ""}cap {Math.round(capGallons).toLocaleString()} of {Math.round(trueMax).toLocaleString()}
            {hasOverride && (
              <button type="button" onClick={onResetCap} style={{ marginLeft: 8, background: "none", border: "none", color: "#ffb020", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Reset ↺</button>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" onClick={onChangeProduct} style={{ padding: "13px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer" }}>
            {isEmpty ? "Pick product" : "Change product"}
          </button>
          <button type="button" onClick={onClose} style={{ padding: "13px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
