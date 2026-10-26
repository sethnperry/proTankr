"use client";
// app/planner/modals/scaleHistory/helpers.ts
//
// Part of ScaleHistoryModal.tsx.

import React from "react";

import type { WeightRecordRaw } from "./types";

export const DATE_RANGES: { label: string; days: number | null }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const yr = String(d.getFullYear()).slice(2);
  return `${mo}/${dy}/${yr}`;
}

export function fmtDateHeader(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function fmt(n: number | null | undefined): string {
  return n == null ? "—" : Math.round(n).toLocaleString();
}

export function buildShareText(rows: WeightRecordRaw[], title: string): string {
  const divider = "─".repeat(40);
  const lines: string[] = [title.toUpperCase(), divider];
  let lastDate = "";
  for (const r of rows) {
    const day = r.recorded_at.slice(0, 10);
    if (day !== lastDate) { lines.push(fmtDate(r.recorded_at)); lastDate = day; }
    lines.push(`  Heavy ${fmt(r.heavy_weight_lbs)} · Light ${fmt(r.light_weight_lbs)} · Net ${fmt(r.net_weight_lbs)} lbs${r.tare_updated ? "  (tare updated)" : ""}`);
    if (r.notes) lines.push(`    ${r.notes}`);
  }
  return lines.join("\n");
}

export function shareViaClipboard(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => window.prompt("Copy this report:", text));
}

export function shareViaSMS(text: string) { window.location.href = `sms:?&body=${encodeURIComponent(text)}`; }

export function shareViaEmail(subject: string, text: string) { window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`; }

export const editInputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 13, boxSizing: "border-box",
};

export const editLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };
