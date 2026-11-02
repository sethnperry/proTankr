// lib/scale/scaleReport.ts
//
// Scale records as a report: columns, filters and summary for the shared report shell, so records are
// reportable per unit and per driver and a citation can be found without reading every row. Pure.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";
import { CITATION_LABEL, SCALE_TYPE_LABEL, type CitationDetail, type PlannerSnapshot, type ScaleType } from "./scaleRecord.ts";

export type ScaleReportRow = {
  weight_record_id: string;
  recorded_at: string;
  created_by: string | null;
  unit: string;
  scale_type: ScaleType;
  heavy_weight_lbs: number | string;
  light_weight_lbs: number | string | null;
  planner_weight_lbs: number | string | null;
  citation: boolean;
  citation_detail: CitationDetail | null;
  planner_snapshot: PlannerSnapshot | null;
  capture_id: string | null;
  notes: string | null;
};

const n = (v: number | string | null | undefined): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const lbs = (v: number | null) => (v == null ? "" : Math.round(v).toLocaleString("en-US"));
const day = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };

/** Net weight when both weighs exist, else the loaded weight alone (a DOT stop). */
export const weighed = (r: ScaleReportRow) => { const h = n(r.heavy_weight_lbs), l = n(r.light_weight_lbs); return h != null && l != null ? h - l : h; };
/** Measured net against what the planner calculated; null without both. */
export const plannerDiff = (r: ScaleReportRow) => { const h = n(r.heavy_weight_lbs), l = n(r.light_weight_lbs), p = n(r.planner_weight_lbs); return h != null && l != null && p != null ? Math.round(h - l - p) : null; };

export function scaleColumns(nameOf: (id: string | null) => string): ShellColumn<ScaleReportRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => day(r.recorded_at), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.created_by), weight: 1.2 },
    { key: "unit", label: "Unit", get: (r) => r.unit, weight: 1 },
    { key: "type", label: "Scale", get: (r) => SCALE_TYPE_LABEL[r.scale_type] ?? r.scale_type, weight: 0.9 },
    { key: "weight", label: "Weight lbs", get: (r) => lbs(weighed(r)), align: "r", weight: 1 },
    { key: "diff", label: "vs planner", get: (r) => { const d = plannerDiff(r); return d == null ? "" : `${d > 0 ? "+" : ""}${d}`; }, align: "r", weight: 0.8 },
    { key: "cit", label: "Citation", get: (r) => (r.citation ? CITATION_LABEL[r.citation_detail?.kind ?? "other"] : ""), weight: 0.9 },
  ];
}

export function scaleFilters(nameOf: (id: string | null) => string): ShellFilter<ScaleReportRow>[] {
  return [
    { id: "driver", label: "Driver", of: (r) => r.created_by ?? "", show: (v) => nameOf(v) },
    { id: "unit", label: "Unit", of: (r) => r.unit },
    { id: "type", label: "Scale", of: (r) => r.scale_type, show: (v) => SCALE_TYPE_LABEL[v as ScaleType] ?? v },
    { id: "cit", label: "Citation", of: (r) => (r.citation ? "yes" : "no"), show: (v) => (v === "yes" ? "Cited" : "No citation") },
  ];
}

export function scaleSummary(rows: ScaleReportRow[]): { label: string; value: string }[] {
  const cited = rows.filter((r) => r.citation);
  const fines = cited.reduce((t, r) => t + (r.citation_detail?.amount ?? 0), 0);
  return [
    { label: "Records", value: String(rows.length) },
    { label: "Citations", value: String(cited.length) },
    { label: "Fines", value: `$${fines.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
  ];
}
