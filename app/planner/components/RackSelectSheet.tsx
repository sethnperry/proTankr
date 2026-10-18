"use client";
// app/planner/components/RackSelectSheet.tsx
//
// Rack-aware loading (see CLAUDE.md "rack-aware loading" discussion,
// 2026-08-16): before this, a terminal's actual observed API/temp readings
// pooled into one shared number regardless of which physical rack a driver
// was actually at -- two racks at the same terminal with genuinely
// different readings would silently blend together. This sheet forces a
// rack pick whenever a terminal has more than one rack (see
// CalculatorShellContext.tsx's chooseTerminal, which decides whether to
// even open this -- a 0- or 1-rack terminal never shows it at all).
//
// Deliberately has no "skip" option: an unresolved rack pick would mean
// this load's actual API/temp has nowhere correct to write, silently
// falling back to the same terminal-wide pooling this whole feature exists
// to fix. Backdrop tap / Escape do nothing (FullscreenModal's onClose isn't
// used here on purpose) -- picking a row is the only way out.

import React from "react";
import { GRAPHITE, GRAPHITE_DARKER , SURFACE } from "../theme";
import { CARD_BG, CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

type RackOption = { rack_id: string; rack_name: string };

type Props = {
  open: boolean;
  terminalLabel?: string;
  racks: RackOption[];
  onPick: (rackId: string) => void;
};

// Restyled 2026-09-05, per explicit direction ("all these windows... need
// our themed color treatment and not have the generic grey hue") -- this
// sheet was still the flat #111518/rgba(255,255,255,0.05) look every other
// bottom sheet in the app (CancelLoadSheet, PresetActionSheet) already
// moved off of; now matches CancelLoadSheet's own GRAPHITE-gradient sheet +
// CARD_BG/CARD_BORDER/CARD_SHADOW row treatment exactly, since it now also
// appears as part of the mid-load terminal-switch flow (page.tsx) where
// the two would otherwise sit right next to each other looking inconsistent.
const rowStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2,
  border: CARD_BORDER, background: CARD_BG, boxShadow: CARD_SHADOW,
  color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};

export default function RackSelectSheet({ open, terminalLabel, racks, onPick }: Props) {
  if (!open) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 10500, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        style={{
          width: "100%", maxWidth: 480,
          background: SURFACE,
          borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.1)",
          padding: "18px 16px calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
          Which rack are you loading at?
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
          {terminalLabel ? `${terminalLabel} has more than one rack. ` : ""}
          API and temp readings differ by rack -- picking the right one keeps them accurate for the next driver here.
        </div>
        {racks.map((r) => (
          <button key={r.rack_id} type="button" style={rowStyle} onClick={() => onPick(r.rack_id)}>
            {r.rack_name}
          </button>
        ))}
      </div>
    </div>
  );
}
