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

import React, { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  slots: readonly number[];
  slotHas: Record<number, boolean>;
  activeSlot: number;
  disabled: boolean;
  disabledReason?: string;
  getSummary: (slot: number) => string;
  getName: (slot: number) => string | undefined;
  getColors: (slot: number) => string[];
  onLoad: (slot: number) => void;
  onSaveEmpty: (slot: number) => void;
  onOpenActions: (slot: number) => void;
  onRename: (slot: number, name: string) => void;
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
  getSummary, getName, getColors, onLoad, onSaveEmpty, onOpenActions, onRename,
  onRecallLastLoad,
}: Props) {
  const [renamingSlot, setRenamingSlot] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  // Reset any in-flight rename whenever the sheet closes -- a stale draft
  // shouldn't survive to the next time it's opened.
  useEffect(() => {
    if (!open) { setRenamingSlot(null); pressTimerRef.current && clearTimeout(pressTimerRef.current); }
  }, [open]);

  if (!open) return null;

  const commitRename = (slot: number) => {
    onRename(slot, draftName);
    setRenamingSlot(null);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 480,
        background: "#0b0b0b",
        borderRadius: "16px 16px 0 0", border: "1px solid rgba(255,255,255,0.1)",
        padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
      }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 12 }}>
          Presets
        </div>

        {disabled && (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>{disabledReason}</div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {slots.map((slot) => {
            const letter = String.fromCharCode(64 + slot);
            const has = !!slotHas[slot];
            const isActive = slot === activeSlot;
            const isRenaming = renamingSlot === slot;
            const name = getName(slot);
            const colors = has ? getColors(slot) : [];

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
              if (disabled || isRenaming) return;
              if (didLongPressRef.current) { didLongPressRef.current = false; return; }
              if (has) onLoad(slot); else onSaveEmpty(slot);
            };

            return (
              <div key={slot} style={{
                borderRadius: 10, border: isActive ? ROW_BORDER_ACTIVE : ROW_BORDER,
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
                  {/* Plain letter, no boxed badge -- white when this is the
                      currently-selected/active plan, dim otherwise. */}
                  <span style={{
                    flexShrink: 0, minWidth: 18, textAlign: "center" as const,
                    fontSize: 16, fontWeight: 800, color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                  }}>
                    {letter}
                  </span>
                  <span style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                    {isRenaming ? (
                      <input
                        autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === "Enter") commitRename(slot); if (e.key === "Escape") setRenamingSlot(null); }}
                        onBlur={() => commitRename(slot)}
                        placeholder="Name this preset"
                        style={{ width: "100%", boxSizing: "border-box" as const, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14, fontWeight: 600 }}
                      />
                    ) : (
                      // Name and dots share one row now (was name, then a
                      // second line of dots underneath) -- dots sized up a
                      // little (9px -> 12px). Gap widened again the same
                      // day (8px -> 16px) per explicit follow-up ("shift
                      // them to the right away from the label a bit").
                      <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: name ? "#fff" : "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flexShrink: 1 }}>
                          {name || `Preset ${letter}`}
                        </div>
                        {has ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }} title={getSummary(slot)}>
                            {colors.map((c, i) => (
                              <span key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c, flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,0.25)" }} />
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                            Tap to save current plan
                          </div>
                        )}
                      </div>
                    )}
                  </span>
                </button>

                {/* Rename affordance -- only meaningful once a slot has real
                    saved content (see usePlanSlots.ts's renameSlot, which
                    has nothing to attach a name to otherwise). */}
                {has && !isRenaming && (
                  <button
                    type="button" disabled={disabled}
                    onClick={(e) => { e.stopPropagation(); setDraftName(name ?? ""); setRenamingSlot(slot); }}
                    aria-label={`Rename Preset ${letter}`}
                    style={{ flexShrink: 0, border: "none", background: "none", padding: 6, cursor: disabled ? "not-allowed" : "pointer", color: "rgba(255,255,255,0.35)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                    </svg>
                  </button>
                )}
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
              width: "100%", marginTop: 14, padding: "12px 16px", borderRadius: 10,
              border: ROW_BORDER, background: ROW_BG, color: "rgba(255,255,255,0.75)",
              fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            ↺ Recall Last Load
          </button>
        )}

        <button type="button" onClick={onClose} style={{ width: "100%", marginTop: 10, padding: "12px 16px", borderRadius: 10, border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Close
        </button>
      </div>
    </div>
  );
}
