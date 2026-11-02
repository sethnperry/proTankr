// lib/scale/scaleRecord.ts
//
// The rules of one scale record, with no Supabase and no browser: what a private / CAT or DOT weigh needs, the
// planner snapshot kept with it, and the row that gets written. The Weight Record window uses this and nothing
// else for its decisions.

export type ScaleType = "private" | "dot";
export const SCALE_TYPE_LABEL: Record<ScaleType, string> = { private: "Private / CAT", dot: "DOT" };

export type CitationKind = "gross" | "axle" | "bridge" | "other";
export const CITATION_LABEL: Record<CitationKind, string> = { gross: "Gross weight", axle: "Axle weight", bridge: "Bridge formula", other: "Other" };
export type CitationDetail = { kind: CitationKind; number: string | null; amount: number | null; note: string | null };

export type SnapshotLine = { comp: number; product: string | null; gallons: number | null; lbs: number | null; temp_f: number | null; api: number | null };
/** What the planner said when the weigh was recorded. */
export type PlannerSnapshot = {
  taken_at: string;
  load_id: string | null;
  load_completed_at: string | null;
  tare_lbs: number | null;
  gross_limit_lbs: number | null;
  planned_net_lbs: number | null;
  planned_gross_lbs: number | null;
  lines: SnapshotLine[];
};

const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number.isFinite(Number(s)) ? Number(s) : null);

export function buildSnapshot(o: {
  now: string; loadId: string | null; loadCompletedAt: string | null; tareLbs: number | null; grossLimitLbs: number | null; plannedNetLbs: number | null; lines: SnapshotLine[];
}): PlannerSnapshot {
  return {
    taken_at: o.now, load_id: o.loadId, load_completed_at: o.loadCompletedAt, tare_lbs: o.tareLbs, gross_limit_lbs: o.grossLimitLbs,
    planned_net_lbs: o.plannedNetLbs,
    planned_gross_lbs: o.tareLbs != null && o.plannedNetLbs != null ? o.tareLbs + o.plannedNetLbs : null,
    lines: o.lines,
  };
}

export type WeighInput = {
  scaleType: ScaleType;
  heavy: string;
  light: string;
  citation: boolean;
  citationKind: CitationKind | null;
  citationNumber: string;
  citationAmount: string;
  citationNote: string;
};

/** What stops Save. The empty weigh is only required on a private / CAT scale. */
export function weighProblem(i: WeighInput): string | null {
  const heavy = numOrNull(i.heavy);
  if (heavy == null || heavy <= 0) return "Enter the loaded weight.";
  if (i.scaleType === "private") {
    const light = numOrNull(i.light);
    if (light == null || light <= 0) return "Enter both the loaded and the empty weight.";
    if (light >= heavy) return "The empty weight must be less than the loaded weight.";
  } else if (i.light.trim() !== "") {
    const light = numOrNull(i.light);
    if (light == null || light <= 0 || light >= heavy) return "The empty weight must be less than the loaded weight, or leave it blank.";
  }
  if (i.citation && !i.citationKind) return "Pick what the citation was for.";
  return null;
}

export const netOf = (heavy: number | null, light: number | null): number | null => (heavy != null && light != null ? heavy - light : null);

export type WeightRecordRow = {
  company_id: string; combo_id: string; load_id: string | null;
  heavy_weight_lbs: number; light_weight_lbs: number | null; planner_weight_lbs: number | null; prior_tare_lbs: number | null;
  tare_updated: boolean; notes: string | null; created_by: string | null;
  scale_type: ScaleType; capture_id: string | null; citation: boolean; citation_detail: CitationDetail | null; planner_snapshot: PlannerSnapshot;
};

export function buildWeightRecordRow(o: {
  input: WeighInput; companyId: string; comboId: string; userId: string | null; loadId: string | null; plannedNetLbs: number | null;
  priorTareLbs: number | null; updateTare: boolean; notes: string; captureId: string | null; snapshot: PlannerSnapshot;
}): WeightRecordRow {
  const heavy = numOrNull(o.input.heavy)!;
  const light = o.input.light.trim() === "" ? null : numOrNull(o.input.light);
  const tareChanged = o.updateTare && light != null && o.priorTareLbs != null && Math.round(light - o.priorTareLbs) !== 0;
  return {
    company_id: o.companyId, combo_id: o.comboId, load_id: o.loadId,
    heavy_weight_lbs: heavy, light_weight_lbs: light, planner_weight_lbs: o.plannedNetLbs, prior_tare_lbs: o.priorTareLbs,
    tare_updated: tareChanged, notes: o.notes.trim() || null, created_by: o.userId,
    scale_type: o.input.scaleType, capture_id: o.captureId,
    citation: o.input.citation,
    citation_detail: o.input.citation && o.input.citationKind
      ? { kind: o.input.citationKind, number: o.input.citationNumber.trim() || null, amount: numOrNull(o.input.citationAmount.replace(/[$,]/g, "")), note: o.input.citationNote.trim() || null }
      : null,
    planner_snapshot: o.snapshot,
  };
}
