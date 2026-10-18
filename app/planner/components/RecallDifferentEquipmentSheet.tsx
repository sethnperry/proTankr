"use client";
// app/planner/components/RecallDifferentEquipmentSheet.tsx
//
// Shown when "Recall Last Load" finds a completed load at the currently
// selected terminal, but under DIFFERENT equipment than what's currently
// selected -- per explicit follow-up: "if I switch to a different
// terminal, I want to recall the last load at that terminal. What
// happens if that load was loaded using different equipment?"
//
// Deliberately does NOT offer to claim/switch to that equipment -- an
// earlier version did (via the same claim_combo RPC EquipmentModal.tsx's
// own handleClaim uses), reversed per explicit follow-up: someone else
// could genuinely be running that truck/trailer right now, and
// claiming/decoupling it out from under them just to satisfy a "let me
// peek at my last load" convenience is a real, disruptive side effect --
// "switching or decoupling and recoupling or really anything we do to
// present the previous load at this terminal would be problematic."
// Instead, links to the load's own read-only report view -- see
// page.tsx's handleViewAltLoadInReports (navigates to
// /planner/reports?loadId=...) and usePlanSlots.ts's
// findLastLoadAtTerminalDifferentEquipment (a pure read, no equipment
// state touched at all).

import React from "react";
import { GRAPHITE, GRAPHITE_DARKER, themeFill, themeTextOnFill , SURFACE } from "../theme";
import { CARD_BORDER, CARD_SHADOW } from "../cards/cardTheme";

export default function RecallDifferentEquipmentSheet({
  open, truckLabel, trailerLabel, onViewInReports, onCancel, darkMode, accentColor,
}: {
  open: boolean;
  truckLabel: string;
  trailerLabel: string;
  onViewInReports: () => void;
  onCancel: () => void;
  darkMode: boolean;
  accentColor: string | null;
}) {
  if (!open) return null;

  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 10500, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
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
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
          Different equipment
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14, lineHeight: 1.4 }}>
          Your last load at this terminal used{" "}
          <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700 }}>{truckLabel} / {trailerLabel}</span>
          , not your current equipment. Someone else may be using it now, so it can't be recalled into the planner here -- view the load details in Reports instead.
        </div>

        <button
          type="button"
          onClick={onViewInReports}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 2, marginBottom: 8,
            border: CARD_BORDER, boxShadow: CARD_SHADOW,
            background: themeFill(darkMode, accentColor, "#fff"),
            color: themeTextOnFill(darkMode),
            fontSize: 15, fontWeight: 700, cursor: "pointer",
          }}
        >
          View This Load in Reports
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            width: "100%", padding: "14px 16px", borderRadius: 2, border: "none",
            background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
