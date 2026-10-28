"use client";
// modals/LoadReportModal.tsx

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { loadReportDoc } from "@/lib/reports/docs";
import type { LoadHistoryRow, LoadHistoryLine } from "../hooks/useLoadHistory";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const yr = String(d.getFullYear()).slice(2);
  return `${mo}/${dy}/${yr} · ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtLbs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v)).toLocaleString()} lbs`;
}
function fmtTemp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Math.round(Number(v))}°F`;
}
function dColor(diff: number | null | undefined): string {
  if (diff == null) return "rgba(255,255,255,0.55)";
  return Number(diff) > 0 ? "#ef4444" : "#4ade80";
}
function dText(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(Number(diff))) return "—";
  const n = Math.round(Number(diff));
  return `${n >= 0 ? "+" : ""}${n.toLocaleString()} lbs`;
}
function asOfDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}`;
}
function buildBody(row: LoadHistoryRow, lines: LoadHistoryLine[] | undefined): string {
  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");
  const subjectParts = [
    fmtDateTime(row.started_at),
    cityState || null,
    row.terminal_name || null,
    row.planned_total_gal != null ? `${Math.round(Number(row.planned_total_gal)).toLocaleString()} gal` : null,
  ].filter(Boolean);
  const divider = "─".repeat(48);
  const header = ["LOAD REPORT", divider, subjectParts.join("  ·  "), divider].join("\n");

  if (!lines || lines.length === 0) return header;

  const totalPlanned = lines.reduce((s, l) => s + (l.planned_lbs ?? 0), 0);
  const totalActual  = lines.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0);
  const hasActual    = lines.some(l => l.actual_lbs != null);
  const totalDiff    = hasActual ? Math.round(totalActual - totalPlanned) : null;

  const lineBlock = lines.map((l) => {
    const ou = l.actual_lbs != null && l.planned_lbs != null ? Math.round(l.actual_lbs - l.planned_lbs) : null;
    const ouTag = ou == null ? "" : ou > 0 ? "  ▲ OVER" : ou === 0 ? "  ✓" : "  ▼ UNDER";
    const apiAs = asOfDate((l as any).planned_api_updated_at);
    const plannedApiStr = l.planned_api != null ? `API ${Number(l.planned_api).toFixed(1)}${apiAs ? ` (as of ${apiAs})` : ""}` : "API —";
    const codeLabel = l.button_code ? `${l.button_code}${l.product_name ? " — " + l.product_name : ""}` : (l.product_name ?? "—");
    return [
      `C${l.comp_number}  ${codeLabel}`,
      `  Planned:  ${fmtLbs(l.planned_lbs)}  ${fmtTemp(l.planned_temp_f)}  ${plannedApiStr}`,
      `  Actual:   ${fmtLbs(l.actual_lbs)}  ${fmtTemp(l.actual_temp_f)}  API ${l.actual_api?.toFixed(1) ?? "—"}  ${ou != null ? `${ou >= 0 ? "+" : ""}${ou.toLocaleString()} lbs` : "—"}${ouTag}`,
    ].join("\n");
  }).join("\n\n");

  const totalDiffTxt = totalDiff == null ? "—" : `${totalDiff >= 0 ? "+" : ""}${totalDiff.toLocaleString()} lbs`;
  const totalTag = totalDiff == null ? "" : totalDiff > 0 ? "  ▲ OVER" : totalDiff === 0 ? "  ✓ ON WEIGHT" : "  ▼ UNDER";

  const LEGAL = 80000;
  let drainLine = "";
  if (hasActual) {
    const plannedGross = row.planned_gross_lbs != null ? Number(row.planned_gross_lbs) : null;
    const tare = plannedGross != null && totalPlanned > 0 ? plannedGross - totalPlanned : null;
    const actualGross = tare != null ? tare + totalActual : null;
    if (actualGross != null && actualGross > LEGAL) {
      const lbsToRemove = actualGross - LEGAL;
      const rear = [...lines].filter(l => l.actual_lbs != null && l.actual_gallons != null && (l.actual_gallons ?? 0) > 0).sort((a, b) => b.comp_number - a.comp_number)[0];
      if (rear?.actual_gallons && rear?.actual_lbs) {
        const lpg = rear.actual_lbs / rear.actual_gallons;
        const prodLabel = rear.button_code ?? rear.product_name ?? `C${rear.comp_number}`;
        drainLine = `\n\nCorrect to 80k lbs: drain ~${(lbsToRemove / lpg).toFixed(1)} gal from C${rear.comp_number} (${prodLabel})`;
      }
    }
  }

  const footer = `${divider}\nTOTAL\n  Planned: ${fmtLbs(totalPlanned)}\n  Actual:  ${hasActual ? fmtLbs(totalActual) : "—"}\n  Net:     ${totalDiffTxt}${totalTag}${drainLine}`;
  return `${header}\n\n${lineBlock}\n\n${footer}`;
}

// ── Rendered report line ───────────────────────────────────────────────────────

function ReportLine({ text, color }: { text: string; color?: string }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 1.6, color: color ?? "rgba(255,255,255,0.75)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const }}>
      {text}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

const BTN: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 2,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.82)",
  fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: 0.3,
};

type Props = {
  open: boolean;
  onClose: () => void;
  row: LoadHistoryRow | null;
  lines: LoadHistoryLine[] | undefined;
};

export default function LoadReportModal({ open, onClose, row, lines }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open || !row || typeof document === "undefined") return null;

  const body = buildBody(row, lines);
  const cityState = [row.city_name, row.state_code].filter(Boolean).join(", ");
  const totalPlanned = lines?.reduce((s, l) => s + (l.planned_lbs ?? 0), 0) ?? 0;
  const totalActual  = lines?.reduce((s, l) => s + (l.actual_lbs  ?? 0), 0) ?? 0;
  const hasActual    = lines?.some(l => l.actual_lbs != null) ?? false;
  const totalDiff    = hasActual ? totalActual - totalPlanned : null;

  function handleCopy() {
    navigator.clipboard.writeText(body)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })
      .catch(() => window.prompt("Copy:", body));
  }
  function handleSMS() { window.location.href = `sms:?&body=${encodeURIComponent(body)}`; }
  function handleEmail() {
    void emailReportPdf(loadReportDoc(row!, lines));
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.80)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", width: "100%", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "4px 18px 12px", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Load Report</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
              {fmtDateTime(row.started_at)}{cityState ? `  ·  ${cityState}` : ""}
            </div>
          </div>
          {/* Net diff badge */}
          {totalDiff != null && (
            <div style={{ fontSize: 16, fontWeight: 900, color: dColor(totalDiff), flexShrink: 0 }}>
              {dText(totalDiff)}
            </div>
          )}
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

        {/* Report body — scrollable */}
        <div style={{ flex: 1, overflowY: "auto", overscrollBehavior: "contain", padding: "16px 18px" }}>

          {/* Compartment cards */}
          {lines && lines.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lines.map((l) => {
                const ou = l.actual_lbs != null && l.planned_lbs != null ? Math.round(l.actual_lbs - l.planned_lbs) : null;
                const apiAs = asOfDate((l as any).planned_api_updated_at);
                const codeLabel = l.button_code ?? l.product_name ?? "—";
                return (
                  <div key={l.comp_number} style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", overflow: "hidden" }}>
                    {/* Comp header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
                        C{l.comp_number} <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{codeLabel}</span>
                        {l.product_name && l.button_code && (
                          <span style={{ color: "rgba(255,255,255,0.30)", fontWeight: 500, fontSize: 12 }}> — {l.product_name}</span>
                        )}
                      </div>
                      {ou != null && (
                        <div style={{ fontSize: 13, fontWeight: 800, color: dColor(ou), whiteSpace: "nowrap" as const }}>
                          {ou >= 0 ? "+" : ""}{ou.toLocaleString()} lbs
                        </div>
                      )}
                    </div>
                    {/* Planned row */}
                    <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 52px 52px 52px", gap: 4, padding: "7px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "baseline" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: 0.4 }}>PLAN</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{fmtLbs(l.planned_lbs)}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "right" as const }}>{fmtTemp(l.planned_temp_f)}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "right" as const }}>{l.planned_api != null ? Number(l.planned_api).toFixed(1) : "—"}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", textAlign: "right" as const }}>{apiAs ? `03/${apiAs.split("/")[1]}` : ""}</div>
                    </div>
                    {/* Actual row */}
                    <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 52px 52px 52px", gap: 4, padding: "7px 12px", alignItems: "baseline" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)", letterSpacing: 0.4 }}>ACTUAL</div>
                      <div style={{ fontSize: 12, fontWeight: l.actual_lbs != null ? 700 : 400, color: l.actual_lbs != null ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.25)" }}>{fmtLbs(l.actual_lbs)}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "right" as const }}>{fmtTemp(l.actual_temp_f)}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "right" as const }}>{l.actual_api != null ? Number(l.actual_api).toFixed(1) : "—"}</div>
                      <div />
                    </div>
                  </div>
                );
              })}

              {/* Totals */}
              <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "10px 12px" }}>
                {[
                  { label: "Planned", val: fmtLbs(totalPlanned), color: "rgba(255,255,255,0.55)" },
                  { label: "Actual",  val: hasActual ? fmtLbs(totalActual) : "—", color: "rgba(255,255,255,0.88)" },
                  { label: "Net",     val: dText(totalDiff), color: dColor(totalDiff) },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.30)", letterSpacing: 0.4 }}>{label.toUpperCase()}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color }}>{val}</div>
                  </div>
                ))}

                {/* Drain line if over 80k */}
                {(() => {
                  if (!hasActual) return null;
                  const plannedGross = row.planned_gross_lbs != null ? Number(row.planned_gross_lbs) : null;
                  const tare = plannedGross != null && totalPlanned > 0 ? plannedGross - totalPlanned : null;
                  const actualGross = tare != null ? tare + totalActual : null;
                  if (actualGross == null || actualGross <= 80000) return null;
                  const lbsToRemove = actualGross - 80000;
                  const rear = [...(lines ?? [])].filter(l => l.actual_lbs != null && l.actual_gallons != null && (l.actual_gallons ?? 0) > 0).sort((a, b) => b.comp_number - a.comp_number)[0];
                  if (!rear?.actual_gallons || !rear?.actual_lbs) return null;
                  const lpg = rear.actual_lbs / rear.actual_gallons;
                  const prodLabel = rear.button_code ?? rear.product_name ?? `C${rear.comp_number}`;
                  return (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 12, fontWeight: 700, color: "#f97316" }}>
                      Correct to 80k lbs: drain ~{(lbsToRemove / lpg).toFixed(1)} gal from C{rear.comp_number} ({prodLabel})
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, paddingTop: 24 }}>No line data available</div>
          )}

          <div style={{ height: 12 }} />
        </div>

        {/* Share buttons */}
        <div style={{ padding: "12px 18px 28px", borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", gap: 8 }}>
          <button type="button" onClick={handleCopy} style={BTN}>{copied ? "✓ Copied" : "Copy"}</button>
          <button type="button" onClick={handleSMS}  style={BTN}>Text</button>
          <button type="button" onClick={handleEmail} style={BTN}>Email PDF</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
