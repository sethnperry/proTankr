"use client";
// app/planner/modals/binder/styles.ts
//
// Part of the Binder (equipment file) dialog.

import React from "react";

export const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 2,
  padding: "9px 11px",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)",
  color: "#fff",
  fontSize: 14,
  boxSizing: "border-box",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "rgba(255,255,255,0.4)",
  marginBottom: 4,
  display: "block",
};

export const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 2,
  border: "none",
  background: "#fff",
  color: "#000",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

export const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 14px",
  borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

export const dangerBtnStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 2,
  border: "1px solid rgba(220,60,60,0.4)",
  background: "rgba(180,40,40,0.12)",
  color: "#fca5a5",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

// Front-page nav buttons -- matches the Add/Edit Truck/Trailer modal's own
// "Service Schedule"/"Details →" ghost-button look (css.btn("ghost") in
// EquipmentDetails.tsx), reproduced here since this file has its own style
// constants rather than importing that file's tokens.
export const navBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 2,
  marginBottom: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  textAlign: "left" as const,
  cursor: "pointer",
};

// ─── Permit type editor (rename / change applies_to / soft-delete) ──────────
