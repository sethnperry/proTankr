"use client";
// app/planner/modals/recordHistory/helpers.ts
//
// Part of RecordHistoryModal.tsx.

import React from "react";

import type { RecordHistoryKind, ServiceTypeRaw, ServiceRow, WashRow } from "./types";


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

// Detail line shown only when a row is expanded -- null when there's
// nothing meaningful to add beyond the collapsed line (companion rows, or
// a type with no interval at all).
export function dueDetailLine(row: ServiceRow, type: ServiceTypeRaw | undefined): string | null {
  if (row.companion) return null;
  if (!type || type.interval_kind === "none" || type.interval_value == null) return null;
  if (type.interval_kind === "duration") {
    const due = new Date(row.date);
    due.setDate(due.getDate() + type.interval_value);
    return `Next due ${fmtDate(due.toISOString())}`;
  }
  if (row.readingValue == null) return "Reading not recorded";
  const unitWord = type.interval_kind === "miles" ? "mi" : "hrs";
  const next = row.readingValue + type.interval_value;
  return `${row.readingValue.toLocaleString()} ${unitWord} · next due ${next.toLocaleString()} ${unitWord}`;
}

export function buildShareText(kind: RecordHistoryKind, serviceRows: ServiceRow[], washRows: WashRow[], title: string): string {
  const divider = "─".repeat(40);
  const lines: string[] = [title.toUpperCase(), divider];
  let lastDate = "";

  if (kind === "service") {
    for (const row of serviceRows) {
      if (row.date !== lastDate) { lines.push(fmtDate(row.date)); lastDate = row.date; }
      const typePart = row.companion ? `${row.typeName} (with ${row.companion.label} ${row.companion.name})` : row.typeName;
      lines.push(`  ${row.unit.label} ${row.unit.name} · ${typePart}`);
      const shopLoc = [row.shopName, row.location].filter(Boolean).join(" · ");
      if (shopLoc) lines.push(`    ${shopLoc}`);
      if (row.notes) lines.push(`    ${row.notes}`);
    }
  } else {
    for (const row of washRows) {
      if (row.date.slice(0, 10) !== lastDate) { lines.push(fmtDate(row.date)); lastDate = row.date.slice(0, 10); }
      lines.push(`  ${row.unit.label} ${row.unit.name}${row.location ? `  ·  ${row.location}` : ""}`);
      if (row.notes) lines.push(`    ${row.notes}`);
    }
  }
  return lines.join("\n");
}

export function shareViaClipboard(text: string, onCopied: () => void) {
  navigator.clipboard.writeText(text).then(onCopied).catch(() => window.prompt("Copy this report:", text));
}

export function shareViaSMS(text: string) {
  window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
}

export function shareViaEmail(subject: string, text: string) {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

export const editInputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 13, boxSizing: "border-box",
};

export const editLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };
