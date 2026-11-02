// lib/maintenance/board.ts
//
// The manager's side of unit maintenance, with no Supabase: the unit board (last done and next due per service
// type, permits, the latest inspection), and inspection campaigns (who has and has not submitted, and what is
// waiting for review). Only inspections made for a campaign go to review.

import { daysUntilIso, expiryStateForDays, type ExpiryState } from "../expiry.ts";
import type { InspectionCondition } from "../trips/types.ts";
import type { UnitKind } from "./inspection.ts";

export type BoardUnit = { id: string; kind: UnitKind; name: string; region: string | null; active: boolean };
export type BoardServiceType = { service_type_id: string; name: string; interval_kind: "miles" | "hours" | "duration" | "none"; interval_value: number | null; applies_to: "truck" | "trailer" | "both"; is_active: boolean };
export type BoardRecord = { unitId: string; service_type_id: string; date: string; reading_value: number | null; created_at: string };
export type BoardPermit = { unitId: string; name: string; expiration_date: string | null };
export type BoardInspection = {
  inspection_id: string; unitId: string; kind: UnitKind; driver_id: string; campaign_id: string | null; created_at: string;
  overall: InspectionCondition; review_status: "none" | "pending" | "reviewed";
  items: { key: string; label: string; condition: InspectionCondition; note: string | null }[];
};
export type Campaign = { campaign_id: string; name: string; unit_kind: "truck" | "trailer" | "both"; region: string | null; due_on: string | null; closed_at: string | null; created_at: string };

// ── Unit board ────────────────────────────────────────────────────────────────────────────────────────────
export type ServiceLine = { name: string; lastDate: string | null; next: string; state: ExpiryState | null };
export type UnitRow = {
  unit: BoardUnit;
  services: ServiceLine[];
  permitState: ExpiryState | null;
  permits: { name: string; days: number | null; state: ExpiryState }[];
  inspection: { at: string; overall: InspectionCondition; failed: string[] } | null;
  /** Worst of: next-due service, permits, latest inspection (replace soon = expired colour, fair = soon). */
  worst: ExpiryState | null;
};

const RANK: Record<ExpiryState, number> = { expired: 0, expiring: 1, soon: 2, valid: 3, not_set: 4, inactive: 5 };
const worseOf = (a: ExpiryState | null, b: ExpiryState | null) => (a == null ? b : b == null ? a : RANK[a] <= RANK[b] ? a : b);
const mdy = (iso: string) => { const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`; };

/** Last done and next due, per service type that applies to this unit. Miles and hours show the reading that falls due. */
export function serviceLines(unit: BoardUnit, types: BoardServiceType[], records: BoardRecord[], todayIso?: string): ServiceLine[] {
  const out: ServiceLine[] = [];
  for (const t of types) {
    if (!t.is_active || (t.applies_to !== "both" && t.applies_to !== unit.kind)) continue;
    const mine = records.filter((r) => r.unitId === unit.id && r.service_type_id === t.service_type_id);
    const last = mine.sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at))[0];
    if (!last && t.interval_kind === "none") continue;
    let next = "No interval";
    let state: ExpiryState | null = null;
    const every = Number(t.interval_value);
    if (t.interval_kind === "duration" && every > 0) {
      if (!last) { next = "Never done"; state = "expired"; }
      else {
        const due = new Date(last.date.slice(0, 10) + "T00:00:00Z"); due.setUTCDate(due.getUTCDate() + every);
        const iso = due.toISOString().slice(0, 10);
        const days = daysUntilIso(iso, todayIso);
        next = `Due ${mdy(iso)}`; state = days == null ? null : expiryStateForDays(days);
      }
    } else if ((t.interval_kind === "miles" || t.interval_kind === "hours") && every > 0) {
      const unitWord = t.interval_kind === "miles" ? "mi" : "h";
      const reading = last ? Number(last.reading_value) : NaN;
      next = Number.isFinite(reading) ? `Due at ${Math.round(reading + every).toLocaleString("en-US")} ${unitWord}` : last ? "No reading" : "Never done";
      if (!last) state = "expired";
    }
    out.push({ name: t.name, lastDate: last ? mdy(last.date) : null, next, state });
  }
  return out;
}

export function unitBoard(o: {
  units: BoardUnit[]; types: BoardServiceType[]; records: BoardRecord[]; permits: BoardPermit[]; inspections: BoardInspection[]; todayIso?: string;
}): UnitRow[] {
  return o.units.filter((u) => u.active).map((unit) => {
    const permits = o.permits.filter((p) => p.unitId === unit.id).map((p) => { const days = daysUntilIso(p.expiration_date, o.todayIso); return { name: p.name, days, state: days == null ? ("not_set" as const) : expiryStateForDays(days) }; });
    const permitState = permits.reduce<ExpiryState | null>((w, p) => (p.state === "not_set" ? w : worseOf(w, p.state)), null);
    const latest = o.inspections.filter((i) => i.unitId === unit.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const inspection = latest ? { at: latest.created_at, overall: latest.overall, failed: latest.items.filter((i) => i.condition !== "good").map((i) => i.label) } : null;
    const services = serviceLines(unit, o.types, o.records, o.todayIso);
    const serviceWorst = services.reduce<ExpiryState | null>((w, s) => worseOf(w, s.state), null);
    const inspState: ExpiryState | null = !inspection ? null : inspection.overall === "replace_soon" ? "expired" : inspection.overall === "fair" ? "soon" : null;
    return { unit, services, permits, permitState, inspection, worst: worseOf(worseOf(serviceWorst, permitState), inspState) };
  }).sort((a, b) => (RANK[a.worst ?? "valid"] - RANK[b.worst ?? "valid"]) || a.unit.name.localeCompare(b.unit.name, undefined, { numeric: true }));
}

// ── Campaigns ─────────────────────────────────────────────────────────────────────────────────────────────
export type CampaignBoard = { campaign: Campaign; targets: number; done: BoardUnit[]; outstanding: BoardUnit[]; pendingReview: number };

const inScope = (c: Campaign, u: BoardUnit) => u.active && (c.unit_kind === "both" || c.unit_kind === u.kind) && (!c.region || u.region === c.region);

/** Done and outstanding units for each campaign. A unit is done when it has an inspection made for that campaign. */
export function campaignBoards(campaigns: Campaign[], units: BoardUnit[], inspections: BoardInspection[]): CampaignBoard[] {
  return campaigns.map((campaign) => {
    const targets = units.filter((u) => inScope(campaign, u));
    const doneIds = new Set(inspections.filter((i) => i.campaign_id === campaign.campaign_id).map((i) => i.unitId));
    return {
      campaign, targets: targets.length,
      done: targets.filter((u) => doneIds.has(u.id)), outstanding: targets.filter((u) => !doneIds.has(u.id)),
      pendingReview: inspections.filter((i) => i.campaign_id === campaign.campaign_id && i.review_status === "pending").length,
    };
  }).sort((a, b) => Number(!!a.campaign.closed_at) - Number(!!b.campaign.closed_at) || b.campaign.created_at.localeCompare(a.campaign.created_at));
}

/** The review queue: inspections made for a campaign that nobody has reviewed. Ordinary inspections never appear. */
export const reviewQueue = (inspections: BoardInspection[]) => inspections.filter((i) => i.campaign_id && i.review_status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at));

/** Campaigns that apply to this unit and that it hasn't been inspected for yet (what the driver is asked to do). */
export function openCampaignsFor(unit: BoardUnit, campaigns: Campaign[], inspections: BoardInspection[]): Campaign[] {
  return campaigns.filter((c) => !c.closed_at && inScope(c, unit) && !inspections.some((i) => i.campaign_id === c.campaign_id && i.unitId === unit.id));
}
