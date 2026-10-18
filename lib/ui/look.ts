// lib/ui/look.ts
//
// The app-wide "instrument" look, first built for the Driver Dashboard
// (app/planner/home/dashLook.tsx): square corners, flat near-black surfaces
// with thin borders, uppercase letter-spaced labels.
//
// Workflow rule (2026-10-18): in every window of the trip/load/delivery/fuel
// flow, the button for the NEXT step (Continue, Finish, Complete, Save...) is
// PRIMARY_BTN: white with black text. Everything else (back, cancel, other
// options) is SECONDARY_BTN or a plain text link.

import type React from "react";

export const RADIUS = 2;
export const SURFACE = "#121213";
export const SURFACE_2 = "#0f0f10";
export const BORDER = "1px solid rgba(255,255,255,0.14)";
export const HAIRLINE = "rgba(255,255,255,0.12)";
export const MUTED = "rgba(255,255,255,0.52)";

export const PRIMARY_BTN: React.CSSProperties = {
  width: "100%", padding: "15px 0", borderRadius: RADIUS, border: "none",
  background: "#fff", color: "#000", fontSize: 15, fontWeight: 800,
  letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer",
};

export const SECONDARY_BTN: React.CSSProperties = {
  width: "100%", padding: "14px 0", borderRadius: RADIUS, border: BORDER,
  background: "transparent", color: "#fff", fontSize: 14, fontWeight: 700,
  letterSpacing: "0.04em", cursor: "pointer",
};

export const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "rgba(255,255,255,0.5)",
};
