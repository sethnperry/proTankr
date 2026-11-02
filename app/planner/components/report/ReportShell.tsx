"use client";
// app/planner/components/report/ReportShell.tsx
//
// One wrapper for every report: a period slot (PeriodPicker), filter buttons that open the shared pick sheet,
// the rows, a row tap that drills down, and CSV and PDF-by-email export. A form's records become a report by
// describing their columns and filters (lib/reports/reportShell.ts). Presentational: no data imports.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PickSheet } from "@/lib/ui/PickSheet";
import { applyFilters, filterOptions, toCsv, toReportDoc, type FilterPick, type ShellColumn, type ShellFilter } from "@/lib/reports/reportShell";
import type { ReportDoc } from "@/lib/reports/reportDoc";

const HAIR = "rgba(255,255,255,0.12)";
const MUTE = "rgba(255,255,255,0.52)";
const btn: React.CSSProperties = { padding: "10px 4px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${HAIR}`, background: "#0a0a0b", color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const btnOn: React.CSSProperties = { ...btn, border: "1px solid #fff", background: "#fff", color: "#000" };

export function ReportShell<T>({ open, title, onClose, rows, columns, filters = [], getKey, onOpenRow, periodSlot, summary, loading, error, empty, fileName, onEmailPdf, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  rows: T[];
  columns: ShellColumn<T>[];
  filters?: ShellFilter<T>[];
  getKey: (row: T) => string;
  /** A row tap: the drill-down (a PTD, a record). Omit for a plain list. */
  onOpenRow?: (row: T) => void;
  /** Where the period chooser goes. */
  periodSlot?: React.ReactNode;
  /** Summary figures shown above the rows, from the filtered rows. */
  summary?: (rows: T[]) => { label: string; value: string }[];
  loading?: boolean;
  error?: string | null;
  empty?: string;
  fileName: string;
  /** Sends the PDF (see lib/reports/emailReport). Omit to hide the button. */
  onEmailPdf?: (doc: ReportDoc) => void;
  children?: React.ReactNode;
}) {
  const [pick, setPick] = useState<FilterPick>({});
  const [sheet, setSheet] = useState<string | null>(null);
  const shown = useMemo(() => applyFilters(rows, filters, pick), [rows, filters, pick]);
  const cells = summary?.(shown) ?? [];

  const exportCsv = () => {
    const blob = new Blob([toCsv(columns, shown)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const cols = Math.min(4, Math.max(1, filters.length));

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      {periodSlot && <div style={{ marginBottom: 10 }}>{periodSlot}</div>}
      {filters.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, marginBottom: 12 }}>
          {filters.map((f) => (
            <button key={f.id} type="button" style={pick[f.id] ? btnOn : btn} onClick={() => setSheet(f.id)}>
              {pick[f.id] ? (f.show ? f.show(pick[f.id]) : pick[f.id]) : f.label}
            </button>
          ))}
        </div>
      )}
      {filters.map((f) => (
        <PickSheet key={f.id} open={sheet === f.id} title={f.label} allLabel={`All ${f.label.toLowerCase()}`} options={filterOptions(rows, f)}
          value={pick[f.id] ?? ""} onPick={(v) => setPick((p) => ({ ...p, [f.id]: v }))} onClose={() => setSheet(null)} />
      ))}
      {cells.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cells.length, 4)}, 1fr)`, gap: 1, background: HAIR, border: `1px solid ${HAIR}`, marginBottom: 12 }}>
          {cells.map((c) => (
            <div key={c.label} style={{ background: "#0f0f10", padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>{c.label}</div>
              <div className="dash-num" style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}
      {children}
      {error && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{error}</div>}
      {loading && shown.length === 0 && <div style={{ color: MUTE }}>Loading…</div>}
      {!loading && !error && shown.length === 0 && <div style={{ color: MUTE, fontSize: 14 }}>{empty ?? "Nothing matches."}</div>}
      {shown.length > 0 && (
        <div style={{ background: "#0f0f10", border: `1px solid ${HAIR}` }}>
          {shown.map((r, i) => (
            <div key={getKey(r)} role={onOpenRow ? "button" : undefined} onClick={onOpenRow ? () => onOpenRow(r) : undefined}
              style={{ display: "grid", gridTemplateColumns: columns.map((c) => `${c.weight ?? 1}fr`).join(" "), gap: 10, alignItems: "center", padding: "11px 12px", borderTop: i ? `1px solid ${HAIR}` : "none", cursor: onOpenRow ? "pointer" : "default" }}>
              {columns.map((c, ci) => {
                const v = c.get(r);
                return (
                  <span key={c.key} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: c.align === "r" ? "right" : "left", fontSize: ci === 0 ? 14 : 13, fontWeight: ci === 0 ? 700 : 500, color: ci === 0 ? "#fff" : "rgba(255,255,255,0.8)" }}>
                    {v == null || v === "" ? "—" : String(v)}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={exportCsv} disabled={shown.length === 0} style={{ ...btn, flex: 1, opacity: shown.length === 0 ? 0.5 : 1 }}>Export CSV</button>
        {onEmailPdf && (
          <button type="button" disabled={shown.length === 0} style={{ ...btn, flex: 1, opacity: shown.length === 0 ? 0.5 : 1 }}
            onClick={() => onEmailPdf(toReportDoc({ title, fileName, columns, rows: shown, cells: cells.map((c) => [c.label, c.value]) }))}>Email PDF</button>
        )}
      </div>
    </FullscreenModal>
  );
}
