"use client";
// app/planner/modals/myLoads/helpers.ts
//
// Part of MyLoadsModal.tsx.

import React from "react";
import type { LoadHistoryRow, LoadHistoryLine } from "../../hooks/useLoadHistory";



/** h:mm ago if < 24h, Xd ago if >= 24h */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const totalMins = Math.floor(diff / 60000);
  if (totalMins < 1) return "0:00 ago";
  if (totalMins < 1440) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}:${String(m).padStart(2, "0")} ago`;
  }
  const days = Math.floor(totalMins / 1440);
  return `${days}d ago`;
}

/** "03/20/26 · 0:19" */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const yr = String(d.getFullYear()).slice(2);
  const h  = d.getHours();
  const m  = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${dy}/${yr} · ${h}:${m}`;
}

export function fmtGal(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} gal`;
}

export function fmtGalBare(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Math.round(Number(v)).toLocaleString();
}

export function fmtLbs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} lbs`;
}

export function fmtLbsBare(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Math.round(Number(v)).toLocaleString();
}

export function fmtTemp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))}°F`;
}

export function lineOverUnder(l: LoadHistoryLine): { text: string; color: string } | null {
  if (l.actual_lbs == null || l.planned_lbs == null) return null;
  const diff = Math.round(l.actual_lbs - l.planned_lbs);
  const color = diff > 0 ? "#ef4444" : "#4ade80";
  return { text: `${diff >= 0 ? "+" : ""}${diff.toLocaleString()} lbs`, color };
}

export function rowDiffColor(diff: number | null | undefined): string {
  if (diff == null) return "rgba(255,255,255,0.4)";
  return Number(diff) > 0 ? "#ef4444" : "#4ade80";
}

export function rowDiffText(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(Number(diff))) return "—";
  const n = Math.round(Number(diff));
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()} lbs`;
}

// ─── Share report builder ─────────────────────────────────────────────────────

export function buildShareText(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined): { subject: string; body: string } {
  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");

  // Subject line: date · city · terminal · gal (no redundant header line)
  const subjectParts = [
    fmtDateTime(row.started_at),
    cityState || null,
    row.terminal_name || null,
    row.planned_total_gal != null ? `${Math.round(Number(row.planned_total_gal)).toLocaleString()} gal` : null,
  ].filter(Boolean);
  const subject = subjectParts.join("  ·  ");

  const diffTxt = rowDiffText(row.diff_lbs);
  const diffTag = row.diff_lbs == null ? "" :
    row.diff_lbs > 0 ? "  ▲ OVER" :
    row.diff_lbs === 0 ? "  ✓ ON WEIGHT" : "  ▼ UNDER";

  const divider = "─".repeat(48);
  const header = [
    "LOAD REPORT",
    divider,
    subject,
    divider,
  ].join("\n");

  let lineBlock = "";
  if (lines && lines.length > 0) {
    const totalPlanned = lines.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
    const totalActual  = lines.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0);
    const hasActual    = lines.some(l => l.actual_lbs != null);
    const totalDiff    = hasActual ? Math.round(totalActual - totalPlanned) : null;

    lineBlock = lines.map((l) => {
      const ou = lineOverUnder(l);
      const ouTag = ou == null ? "" :
        Number(l.actual_lbs) > Number(l.planned_lbs) ? "  ▲ OVER" :
        Number(l.actual_lbs) === Number(l.planned_lbs) ? "  ✓" : "  ▼ UNDER";

      // Planned API with as-of date
      const plannedApiStr = l.planned_api != null
        ? `API ${Number(l.planned_api).toFixed(1)}${(l as any).planned_api_updated_at
            ? ` (as of ${(() => { const d = new Date((l as any).planned_api_updated_at); return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`; })()})`
            : ""}`
        : "API —";

      const codeLabel = l.button_code
        ? `${l.button_code}${l.product_name ? " — " + l.product_name : ""}`
        : (l.product_name ?? "—");
      const rows = [
        `C${l.comp_number}  ${codeLabel}`,
        `  Planned:  ${fmtLbs(l.planned_lbs)}  ${fmtTemp(l.planned_temp_f)}  ${plannedApiStr}`,
        `  Actual:   ${fmtLbs(l.actual_lbs)}  ${fmtTemp(l.actual_temp_f)}  API ${l.actual_api?.toFixed(1) ?? "—"}  ${ou?.text ?? "—"}${ouTag}`,
      ];
      return rows.join("\n");
    }).join("\n\n");

    const totalDiffTxt = totalDiff == null ? "—" :
      `${totalDiff >= 0 ? "+" : ""}${totalDiff.toLocaleString()} lbs`;
    const totalTag = totalDiff == null ? "" :
      totalDiff > 0 ? "  ▲ OVER" :
      totalDiff === 0 ? "  ✓ ON WEIGHT" : "  ▼ UNDER";

    // Drain-down calc — to legal limit of 80,000 lbs gross
    // Tare = planned_gross_lbs - planned payload total
    // Actual gross = tare + actual payload
    const LEGAL_GROSS = 80000;
    let drainLine = "";
    if (hasActual) {
      const plannedGross = row.planned_gross_lbs != null ? Number(row.planned_gross_lbs) : null;
      const plannedPayload = totalPlanned;
      const tare = plannedGross != null && plannedPayload > 0 ? plannedGross - plannedPayload : null;
      const actualGross = tare != null ? tare + totalActual : null;
      if (actualGross != null && actualGross > LEGAL_GROSS) {
        const lbsToRemove = actualGross - LEGAL_GROSS;
        // Rear = highest comp_number with actual data
        const rearComp = [...lines]
          .filter(l => l.actual_lbs != null && l.actual_gallons != null && l.actual_gallons > 0)
          .sort((a, b) => b.comp_number - a.comp_number)[0] ?? null;
        if (rearComp && rearComp.actual_gallons && rearComp.actual_lbs) {
          const lpg = rearComp.actual_lbs / rearComp.actual_gallons;
          const galToDrain = lbsToRemove / lpg;
          const prodLabel = rearComp.button_code ?? rearComp.product_name ?? `C${rearComp.comp_number}`;
          drainLine = `\n\nCorrect to 80k lbs: drain ~${galToDrain.toFixed(1)} gal from C${rearComp.comp_number} (${prodLabel})`;
        }
      }
    }

    lineBlock += `\n\n${divider}\n`;
    lineBlock += `TOTAL\n`;
    lineBlock += `  Planned: ${fmtLbs(totalPlanned)}\n`;
    lineBlock += `  Actual:  ${hasActual ? fmtLbs(totalActual) : "—"}\n`;
    lineBlock += `  Net:     ${totalDiffTxt}${totalTag}`;
    if (drainLine) lineBlock += drainLine;
  }

  const body = lineBlock ? `${header}\n\n${lineBlock}` : header;
  return { subject, body };
}

export function shareViaClipboard(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined, onCopied: () => void) {
  const { subject, body } = buildShareText(row, lines);
  navigator.clipboard.writeText(body)
    .then(onCopied)
    .catch(() => window.prompt("Copy this report:", body));
}

export function shareViaSMS(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined) {
  const { body } = buildShareText(row, lines);
  // sms: URI with no number — opens default SMS app, user picks contact
  // body param is url-encoded; iOS uses &body=, Android uses ?body=
  const encoded = encodeURIComponent(body);
  // Try iOS format first; Android handles both
  window.location.href = `sms:?&body=${encoded}`;
}

export function shareViaEmail(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined) {
  const { subject, body } = buildShareText(row, lines);
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}


// ─── Expanded line rows ───────────────────────────────────────────────────────

export function shareBtnStyle(color?: string): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 5,
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 2, padding: "5px 10px", cursor: "pointer",
    fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
    color: color ?? "rgba(255,255,255,0.55)",
    transition: "all 150ms ease", whiteSpace: "nowrap",
  };
}
