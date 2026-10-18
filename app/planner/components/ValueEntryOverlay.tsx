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

import React, { useEffect, useRef, useState } from "react";
import { KeypadToggle } from "@/lib/ui/KeypadToggle";

export type ValueEntryField = {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  /** Digits + at most one decimal point (API/Temp) vs. digits-only (gallons). Default false. */
  decimal?: boolean;
  /** Show the label even when it's the only field. */
  showLabel?: boolean;
  /** Free text (a BOL number): no number filtering, text keyboard. */
  text?: boolean;
  /** Shown after this field (e.g. the supplier button between BOL and gross). */
  after?: React.ReactNode;
  /** Keypad Next/Enter on this field. Return true when handled (e.g. it
   *  opened the supplier picker); otherwise focus moves to the next field,
   *  and the last field submits. */
  onEnter?: () => boolean;
};

type Props = {
  open: boolean;
  title: string;
  fields: ValueEntryField[];
  hint?: React.ReactNode;
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
  /** Red line above the buttons (e.g. "BOL already used"). */
  error?: string | null;
  /** Disables the submit button and relabels it (an async check is running). */
  busyLabel?: string | null;
  /** Field to focus when the card opens or this value changes (default: first). */
  focusKey?: string | null;
  /** Rendered between the fields and the hint (e.g. a Split Load button). */
  footer?: React.ReactNode;
};

function sanitize(raw: string, decimal: boolean): string {
  if (!decimal) return raw.replace(/[^0-9]/g, "");
  let v = raw.replace(/[^0-9.]/g, "");
  const parts = v.split(".");
  if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
  return v;
}

export default function ValueEntryOverlay({ open, title, fields, hint, onCancel, onSubmit, submitLabel = "Set", dotColor, cancelLabel = "Cancel", error, busyLabel, focusKey, footer }: Props) {
  // Many fields (the trip Loaded steps: BOL, gross, net, temp, API) get a
  // smaller input so the card still fits above the keyboard.
  const compact = fields.length > 3;
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Text fields (BOL #) open on the number pad; the ABC button switches.
  const [alphaKeys, setAlphaKeys] = useState<Record<string, boolean>>({});

  // Re-focus (and re-select) the first field whenever the step changes.
  // `autoFocus` on the input below only fires when that DOM node is newly
  // mounted -- true for a fresh open, but NOT true for a multi-step
  // sequence that keeps this same overlay instance open across steps
  // (LoadingModal's per-compartment Log-the-Load walk swaps `title`/fields
  // without ever setting `open` back to false) -- so the inputs are reused
  // in place and whichever field the driver last tapped stayed focused/
  // highlighted into the next compartment instead of resetting to the
  // first field. Keyed on `title`, which is unique per step for every
  // current caller (LoadingModal's own seqLabel always includes the
  // compartment number).
  useEffect(() => {
    if (!open) return;
    const key = focusKey && inputRefs.current[focusKey] ? focusKey : fields[0]?.key;
    const el = key ? inputRefs.current[key] : null;
    el?.focus();
    el?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, focusKey]);

  // Keypad Next walks the fields in order; the last one submits.
  const onFieldEnter = (i: number) => {
    const f = fields[i];
    if (f.onEnter && f.onEnter()) return;
    const next = fields[i + 1];
    const el = next ? inputRefs.current[next.key] : null;
    if (el) { el.focus(); el.select(); return; }
    onSubmit();
  };

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
          width: "100%", maxWidth: compact ? 320 : 280,
          maxHeight: "calc(100dvh - 48px)", overflowY: "auto" as const, boxSizing: "border-box" as const,
          background: "#161616", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 2, padding: 20,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>
          {dotColor && <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
          {title}
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: compact ? 8 : 12 }}>
          {fields.map((f, i) => (
            <div key={f.key} style={{ width: "100%" }}>
              {(fields.length > 1 || f.showLabel) && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: 0.4, textTransform: "uppercase" as const, marginBottom: 2 }}>
                  {f.label}
                </div>
              )}
              <div style={{ position: "relative" }}>
                <input
                  ref={(el) => { inputRefs.current[f.key] = el; }}
                  type="text"
                  inputMode={f.text ? (alphaKeys[f.key] ? "text" : "numeric") : f.decimal ? "decimal" : "numeric"}
                  pattern={(f.text && alphaKeys[f.key]) || f.decimal ? undefined : "[0-9]*"}
                  autoCapitalize={f.text ? "characters" : undefined}
                  autoCorrect={f.text ? "off" : undefined}
                  autoFocus={i === 0 && !focusKey}
                  enterKeyHint={i < fields.length - 1 ? "next" : "done"}
                  value={f.value}
                  onChange={(e) => f.onChange(f.text ? e.target.value : sanitize(e.target.value, !!f.decimal))}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onFieldEnter(i); } }}
                  style={{
                    width: "100%", textAlign: "center" as const,
                    background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)",
                    color: "#fff", fontSize: compact ? 26 : 40, fontWeight: 700, padding: compact ? "2px 0" : "4px 0",
                    ...(f.text ? { paddingLeft: 48, paddingRight: 48, boxSizing: "border-box" as const } : {}),
                  }}
                />
                {f.text && (
                  <KeypadToggle
                    alpha={!!alphaKeys[f.key]}
                    onToggle={(next) => setAlphaKeys((m) => ({ ...m, [f.key]: next }))}
                    inputRef={{ get current() { return inputRefs.current[f.key] ?? null; } }}
                    style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)" }}
                  />
                )}
                {f.suffix && (
                  <span style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)" }}>
                    {f.suffix}
                  </span>
                )}
              </div>
              {f.after}
            </div>
          ))}
        </div>

        {footer}

        {hint && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {hint}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", textAlign: "center" as const }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.15)", background: "transparent",
              color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!!busyLabel}
            aria-busy={!!busyLabel}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 2,
              border: "none", background: "#fff",
              color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer",
              opacity: busyLabel ? 0.5 : 1,
            }}
          >
            {busyLabel || submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
