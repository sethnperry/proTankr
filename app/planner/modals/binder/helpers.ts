"use client";
// app/planner/modals/binder/helpers.ts
//
// Part of the Binder (equipment file) dialog.

import type { UnitKind, Row } from "./types";

export function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}

export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(iso + "T00:00:00");
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

export function statusColor(row: Row): string {
  if (!row.record?.expiration_date) return "rgba(255,255,255,0.3)";
  if (row.expired) return "#ef4444";
  if (row.daysLeft != null && row.daysLeft <= 30) return "#fbbf24";
  return "rgba(255,255,255,0.6)";
}

// Canonical starter names -- mirrors the categories the old hardcoded
// truck/trailer columns used to track (see CLAUDE.md), offered as a
// quick-pick so a fresh company isn't stuck typing every standard permit
// name from scratch. Purely a suggestion list for the "Add permit type"
// flow -- doesn't touch the schema, and "+ Add custom" always falls
// through to the same free-text editor.
export const PERMIT_SUGGESTIONS: Record<UnitKind, string[]> = {
  truck: [
    "Registration",
    "Annual Inspection",
    "IFTA Permits + Decals",
    "PHMSA HazMat Permit",
    "Alliance HazMat Permit",
    "Fleet Insurance Cab Card",
    "HazMat Transportation Lic",
    "Inner Bridge Permit",
  ],
  trailer: ["Trailer Registration", "Annual Inspection", "Tank V", "Tank K", "Tank L", "Tank T", "Tank I", "Tank P", "Tank UC"],
};

export function statusText(row: Row): string {
  if (!row.record?.expiration_date) return "Not set";
  if (row.expired) return `Expired ${fmtDate(row.record.expiration_date)}`;
  if (row.daysLeft != null && row.daysLeft <= 30) return `Expires ${fmtDate(row.record.expiration_date)}`;
  return fmtDate(row.record.expiration_date);
}
