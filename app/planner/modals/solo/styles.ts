"use client";
// app/planner/modals/solo/styles.ts
//
// Colors and inline styles for the Equipment modal.

import React from "react";
export const COLOR_TARE = "rgba(255,255,255,0.86)";
export const COLOR_SERVICE = "#fbbf24";
export const COLOR_WASH = "#67e8f9";

export const S = {
  sectionHeader: {
    fontSize: 13,
    fontWeight: 800 as const,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    marginBottom: 10,
    textAlign: "center" as const,
  },
  card: {
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    padding: "14px 10px",
    textAlign: "center" as const,
    cursor: "pointer",
    userSelect: "none" as const,
    fontWeight: 900,
    fontSize: 17,
    color: "rgba(255,255,255,0.85)",
  } as React.CSSProperties,
  cardSelected: {
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.45)",
    color: "#fff",
  } as React.CSSProperties,
  selectEquipmentBtn: {
    width: "100%",
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    fontWeight: 900,
    fontSize: 14,
    letterSpacing: 0.3,
    padding: "14px 10px",
    textAlign: "center" as const,
    cursor: "pointer",
  } as React.CSSProperties,
  // Shown on a picker card ONLY while the Borrowed/Away filter is on --
  // every card in that filtered list is already away by construction, so
  // this is the one place a plain card still needs to say WHERE it
  // currently is; the default (unfiltered) grid stays plain, per explicit
  // direction not to clutter it normally.
  cardCurrentCaption: {
    fontSize: 10,
    fontWeight: 700 as const,
    color: "#fb923c",
    marginTop: 4,
    textTransform: "none" as const,
    letterSpacing: 0,
  } as React.CSSProperties,
  // ── Status report (replaces the old per-card away badge/caption) ──
  statusEmpty: {
    textAlign: "center" as const,
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    padding: "18px 10px",
    fontWeight: 600,
  } as React.CSSProperties,
  statusCard: {
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    padding: "14px 16px",
  } as React.CSSProperties,
  statusHeader: {
    fontSize: 17,
    fontWeight: 900 as const,
    color: "#fff",
    marginBottom: 8,
  } as React.CSSProperties,
  statusLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 0",
  } as React.CSSProperties,
  statusLabel: { fontSize: 12, fontWeight: 700 as const, color: "rgba(255,255,255,0.45)" },
  statusValue: { fontSize: 13, fontWeight: 800 as const, color: "rgba(255,255,255,0.9)" },
  // A unit currently coupled outside its own home region -- reuses the same
  // orange already used for ScaleTicketModal's "cutting it close" warning,
  // for visual consistency rather than inventing a new color.
  statusAwayNote: {
    fontSize: 11,
    fontWeight: 700 as const,
    color: "#fb923c",
    marginTop: 6,
  } as React.CSSProperties,
  plusCard: {
    borderRadius: 2,
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "transparent",
    padding: "14px 10px",
    textAlign: "center" as const,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 20,
    color: "rgba(255,255,255,0.35)",
  } as React.CSSProperties,
  divider: { height: 1, background: "rgba(255,255,255,0.08)", margin: "16px 0" },
  reportLine: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    cursor: "pointer",
  } as React.CSSProperties,
  reportLabel: { fontSize: 13, fontWeight: 700 as const, color: "rgba(255,255,255,0.45)" },
  actionBtn: (): React.CSSProperties => ({
    flex: 1,
    borderRadius: 2,
    padding: "12px 8px",
    textAlign: "center" as const,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "rgba(255,255,255,0.85)",
    fontWeight: 900,
    fontSize: 13,
    letterSpacing: 0.3,
    cursor: "pointer",
  }),
};

// ─── Connector line ───────────────────────────────────────────────────────────
// Draws a line + arrowhead from the selected truck card to the selected
// trailer card, tracking position on scroll/resize. Purely visual.

export const saveBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 2,
  border: "none",
  background: "#fff",
  color: "#000",
  fontWeight: 900,
  fontSize: 15,
  cursor: "pointer",
};
