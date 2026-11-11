"use client";
// app/planner/components/PresetQuickPick.tsx
//
// Replaces the swipeable A-E PresetDial as the plan-letter icon's tap
// target -- per explicit direction ("the current plan icon can just be a
// quick pick window") -- a plain list of all 5 named presets instead of a
// horizontal scroll-and-tap strip, since the new compact icon row isn't
// fighting for space the way the dial's old full-width position was. Same
// tap-to-load / tap-empty-to-save semantics the dial always had (see
// page.tsx's own former onLoad/onSave wiring), plus a new per-row rename
// affordance -- "we can even offer a custom name option in the window next
// to the plan letter since we aren't fighting for space."
//
// Long-press on a filled row still opens the existing PresetActionSheet
// (Edit/Clear) rather than duplicating that logic here -- same reuse this
// component's own predecessor (PresetDial) already established.
//
// Restyled twice, same day. First pass reused this app's GRAPHITE-gradient
// card look (CancelLoadSheet.tsx/Cards tab/Reports tiles) -- explicit
// follow-up called that out as having "a [] hue" and pointed at
// ExpirationModal.tsx as the reference instead: that modal's own rows use
// plain, genuinely neutral rgba(255,255,255,x) fills over a flat #0b0b0b
// sheet background (matching lib/ui/FullscreenModal.tsx's own bg-[#0b0b0b]
// exactly), not a colored gradient -- GRAPHITE/GRAPHITE_DARKER (#2a2a2c/
// #1c1c1e) aren't perfectly neutral grays, which is what read as a hue.
// Second pass also moved the colored-dot summary onto the SAME line as
// the plan name (was its own line underneath) and sized the dots up a
// little (9px -> 12px).
//
// The plan-letter badge lost its boxed square (plain bold text now --
// white when active, dim otherwise) and each row's text summary was
// replaced with a row of colored dots -- one per compartment (not just
// the filled ones, see page.tsx's colorsForSlot), colored via
// productColorFor's product-family coding, black for an empty compartment
// -- "instead of describing the plan just use colored dots for a quick
// visual representation of the product selection."

import React, { useEffect, useRef } from "react";
import { PlanLine, type PlanLineComp } from "./PlanLine";

type Props = {
  open: boolean;
  onClose: () => void;
  slots: readonly number[];
  slotHas: Record<number, boolean>;
  activeSlot: number;
  disabled: boolean;
  disabledReason?: string;
  getSummary: (slot: number) => string;
  getComps: (slot: number) => PlanLineComp[];
  onLoad: (slot: number) => void;
  onSaveEmpty: (slot: number) => void;
  onOpenActions: (slot: number) => void;
  // Optional -- omitted, this row doesn't render. A deliberate, separate
  // home for the "Recall Last Load" action (per explicit direction) after
  // it was removed from the recap card's own label, which used to double
  // as a tap target for exactly this and made it too easy to silently
  // overwrite the live plan with a past load's content.
  onRecallLastLoad?: () => void;
};

const LONG_PRESS_MS = 600;

// Neutral, no-hue palette -- matches ExpirationModal.tsx's own
// ExpirationCard exactly (ignoring that component's expired/urgent/
// deferred variants, which don't apply here): plain white-alpha overlays,
// not a colored gradient.
const ROW_BG = "rgba(255,255,255,0.03)";
const ROW_BG_ACTIVE = "rgba(255,255,255,0.06)";
const ROW_BORDER = "1px solid rgba(255,255,255,0.07)";
const ROW_BORDER_ACTIVE = "1px solid rgba(255,255,255,0.25)";

export default function PresetQuickPick({
  open, onClose, slots, slotHas, activeSlot, disabled, disabledReason,
  getSummary, getComps, onLoad, onSaveEmpty, onOpenActions,
  onRecallLastLoad,
}: Props) {
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  useEffect(() => {
    if (!open) { pressTimerRef.current && clearTimeout(pressTimerRef.current); }
  }, [open]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480,
        background: "#0b0b0b",
        borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.1)",
        padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
            Plan Slots
          </span>
        </div>

        {disabled && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{disabledReason}</div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {/* Plans fill in order: show the saved ones and the next free one, never a run of empties. */}
          {slots.filter((slot) => slot <= Math.max(0, ...slots.filter((x) => !!slotHas[x])) + 1).map((slot) => {
            const letter = String.fromCharCode(64 + slot);
            const has = !!slotHas[slot];
            const isActive = slot === activeSlot;
                        const comps = has ? getComps(slot) : [];

            const onPressStart = () => {
              if (disabled || !has) return;
              didLongPressRef.current = false;
              pressTimerRef.current = setTimeout(() => {
                didLongPressRef.current = true;
                onOpenActions(slot);
              }, LONG_PRESS_MS);
            };
            const onPressEnd = () => {
              if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
            };
            const onTap = () => {
              if (disabled) return;
              if (didLongPressRef.current) { didLongPressRef.current = false; return; }
              if (has) onLoad(slot); else onSaveEmpty(slot);
            };

            return (
              <div key={slot} style={{
                borderRadius: 2, border: isActive ? ROW_BORDER_ACTIVE : ROW_BORDER,
                background: isActive ? ROW_BG_ACTIVE : ROW_BG,
                padding: "10px 12px", display: "flex", alignItems: "center", gap: 12,
              }}>
                <button
                  type="button" disabled={disabled}
                  onPointerDown={onPressStart} onPointerUp={onPressEnd} onPointerLeave={onPressEnd}
                  onClick={onTap}
                  style={{
                    flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12,
                    border: "none", background: "none", padding: 0, textAlign: "left" as const,
                    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1, overflow: "hidden" }} title={has ? getSummary(slot) : undefined}>
                    {has ? <PlanLine letter={letter} comps={comps} active={isActive} /> : (
                      <span style={{ fontSize: 14 }}>
                        <span style={{ fontWeight: 800, color: "rgba(255,255,255,0.55)" }}>Plan {letter}:</span>{" "}
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Tap to save current plan</span>
                      </span>
                    )}
                  </span>
                </button>

              </div>
            );
          })}
        </div>

        {onRecallLastLoad && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => { onClose(); onRecallLastLoad(); }}
            style={{
              width: "100%", marginTop: 14, padding: "12px 16px", borderRadius: 2,
              border: ROW_BORDER, background: ROW_BG, color: "rgba(255,255,255,0.75)",
              fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ↺ Recall Last Load
          </button>
        )}

        <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 10, padding: "12px 16px", borderRadius: 2, border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Close
        </button>
      </div>
    </div>
  );
}
