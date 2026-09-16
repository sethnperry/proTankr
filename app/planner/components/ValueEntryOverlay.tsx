"use client";
// app/planner/components/ValueEntryOverlay.tsx
//
// Shared "blown-up numeric entry" overlay -- generalized from
// PlannerControls.tsx's inline `capInput` overlay (the compartment cap
// slider's precise-entry popup: centered card, big bold centered numeric
// input, device keypad, Cancel/Set buttons) into a component that takes
// 1-3 fields instead of one hardcoded field, so it can be reused wherever
// this app needs a quick, deliberate single- or multi-value correction:
// PlannerControls.tsx's own cap entry, the Loading modal's Plan Review
// phase (compartment gallons; product API+Temp), and its new Verify
// Against BOL phase (per-compartment Gallons+Temp+API together).

import React from "react";

export type ValueEntryField = {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  /** Digits + at most one decimal point (API/Temp) vs. digits-only (gallons). Default false. */
  decimal?: boolean;
};

type Props = {
  open: boolean;
  title: string;
  fields: ValueEntryField[];
  hint?: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  /** Optional product color dot rendered before the title -- per explicit
   *  direction, drivers need the same colored-dot visual next to the product
   *  everywhere it appears, to avoid mix-ups / cross-drops. */
  dotColor?: string;
  /** Relabels the left (onCancel) button -- e.g. a multi-step sequence (the
   *  per-compartment Log-the-Load walk) repurposes this same button as
   *  "‹ Back" (stepping to the previous entry) on every step but the first,
   *  rather than adding a second control. Defaults to "Cancel". */
  cancelLabel?: string;
};

function sanitize(raw: string, decimal: boolean): string {
  if (!decimal) return raw.replace(/[^0-9]/g, "");
  let v = raw.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  return v;
}

export default function ValueEntryOverlay({ open, title, fields, hint, onCancel, onSubmit, submitLabel = "Set", dotColor, cancelLabel = "Cancel" }: Props) {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.6)",
        // Pinned to the TOP, not centered: the on-screen number pad rises from
        // the bottom and covered a centered card, hiding the field being typed.
        // Top-aligned (clear of the notch/status bar) keeps the input visible
        // above the keyboard on a phone.
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingLeft: 24, paddingRight: 24, paddingBottom: 24,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 280,
          background: "#161616", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 4, padding: 20,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>
          {dotColor && <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
          {title}
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          {fields.map((f, i) => (
            <div key={f.key} style={{ width: "100%" }}>
              {fields.length > 1 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4, textTransform: "uppercase" as const, marginBottom: 2 }}>
                  {f.label}
                </div>
              )}
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  inputMode={f.decimal ? "decimal" : "numeric"}
                  pattern={f.decimal ? undefined : "[0-9]*"}
                  autoFocus={i === 0}
                  value={f.value}
                  onChange={(e) => f.onChange(sanitize(e.target.value, !!f.decimal))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
                  style={{
                    width: "100%", textAlign: "center" as const,
                    background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)",
                    color: "#fff", fontSize: 40, fontWeight: 700, padding: "4px 0",
                  }}
                />
                {f.suffix && (
                  <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>
                    {f.suffix}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {hint && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {hint}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
              color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 4,
              border: "none", background: "#fff",
              color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer",
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
