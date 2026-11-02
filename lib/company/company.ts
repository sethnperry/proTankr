// lib/company/company.ts
//
// The Company Dashboard's builders, with no Supabase and no React: the region filter, the fleet strip, what needs
// the manager, the gauges, the day ribbon, the compliance heatmap and the campaign bars. The view only draws what
// these return. Pure, so each is tested.

import { EXPIRY_COLOR, type ExpiryState } from "../expiry.ts";
import type { PlanAlert } from "../dispatch/planAlerts.ts";
import type { CampaignBoard } from "../maintenance/board.ts";

// ── Region filter ──────────────────────────────────────────────────────────────────────────────────────────
export const NO_REGION = "No region";
export const regionName = (r: string | null | undefined) => (r ?? "").trim() || NO_REGION;
/** An empty selection shows everything. */
export const inRegions = (sel: Set<string>, region: string | null | undefined) => sel.size === 0 || sel.has(regionName(region));
export const regionOptions = (regions: (string | null | undefined)[]) => [...new Set(regions.map(regionName))].sort((a, b) => (a === NO_REGION ? 1 : b === NO_REGION ? -1 : a.localeCompare(b)));

// ── Fleet strip: one box per unit ──────────────────────────────────────────────────────────────────────────
export type FleetState = "in_use" | "deadline" | "readyline" | "available";
export const FLEET_COLOR: Record<FleetState, string> = { in_use: "#60a5fa", deadline: "#f87171", readyline: "#fbbf24", available: "rgba(255,255,255,0.25)" };
export const FLEET_LABEL: Record<FleetState, string> = { in_use: "In use", deadline: "Deadline", readyline: "Readyline", available: "Available" };
/** Days a box is "full": a unit that has sat in a status this long fills its box. */
export const FLEET_FULL_DAYS = 14;

export type FleetUnit = { id: string; name: string; kind: "truck" | "trailer"; region: string | null; active: boolean; status_code: string | null; status_updated_at: string | null };
export type FleetBox = { id: string; name: string; kind: "truck" | "trailer"; state: FleetState; days: number; fill: number };

export function fleetState(code: string | null | undefined): FleetState {
  const c = (code ?? "").toLowerCase();
  return c === "in_use" ? "in_use" : c === "deadline" ? "deadline" : c === "readyline" ? "readyline" : "available";
}
export function fleetStrip(units: FleetUnit[], nowMs: number, regions: Set<string>): { boxes: FleetBox[]; counts: Record<FleetState, number> } {
  const counts: Record<FleetState, number> = { in_use: 0, deadline: 0, readyline: 0, available: 0 };
  const rank: Record<FleetState, number> = { deadline: 0, readyline: 1, in_use: 2, available: 3 };
  const boxes: FleetBox[] = [];
  for (const u of units) {
    if (!u.active || !inRegions(regions, u.region)) continue;
    const state = fleetState(u.status_code);
    const since = u.status_updated_at ? Date.parse(u.status_updated_at) : NaN;
    const days = Number.isFinite(since) ? Math.max(0, Math.floor((nowMs - since) / 86400_000)) : 0;
    counts[state] += 1;
    boxes.push({ id: u.id, name: u.name, kind: u.kind, state, days, fill: Math.min(1, Math.max(0.12, days / FLEET_FULL_DAYS)) });
  }
  boxes.sort((a, b) => rank[a.state] - rank[b.state] || b.days - a.days || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { boxes, counts };
}

// ── Needs you ──────────────────────────────────────────────────────────────────────────────────────────────
export type NeedsKey = "repairs" | "shifts" | "billable" | "reviews" | "errors";
export type NeedsItem = { key: NeedsKey; label: string; count: number };
export function needsYou(n: { repairsAwaiting: number; unconfirmedShifts: number; unreviewedBillable: number; pendingReviews: number; deskErrors?: number }): { items: NeedsItem[]; total: number } {
  const all: NeedsItem[] = [
    { key: "repairs", label: "Repair approvals waiting", count: n.repairsAwaiting },
    { key: "shifts", label: "Shifts nobody confirmed", count: n.unconfirmedShifts },
    { key: "billable", label: "Billable time not reviewed", count: n.unreviewedBillable },
    { key: "reviews", label: "Inspections to review", count: n.pendingReviews },
    { key: "errors", label: "Problems on the Desk", count: n.deskErrors ?? 0 },
  ];
  const items = all.filter((i) => i.count > 0);
  return { items, total: items.reduce((t, i) => t + i.count, 0) };
}

// ── Gauges ─────────────────────────────────────────────────────────────────────────────────────────────────
export type GaugeKey = "needs" | "down" | "hours" | "compliance" | "shift" | "delayed" | "callouts" | "billable";
export type Gauge = { key: GaugeKey; label: string; value: string; unit?: string; color?: string };
const GREY = "rgba(255,255,255,0.35)";
const RED = EXPIRY_COLOR.expired, ORANGE = EXPIRY_COLOR.expiring, YELLOW = EXPIRY_COLOR.soon;
const WHITE = "#ffffff";

export const worstState = (states: ExpiryState[]): ExpiryState | null => {
  for (const s of ["expired", "expiring", "soon"] as ExpiryState[]) if (states.includes(s)) return s;
  return states.length ? "valid" : null;
};
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}` : `${min}m`);

export function gauges(o: {
  needs: number; down: number; hoursRisk: number; complianceWorst: ExpiryState | null; complianceCount: number;
  onShift: number; delayedMin: number; callouts: number; calloutsBlocking: number; billableMin: number;
}): Gauge[] {
  return [
    { key: "needs", label: "Needs you", value: String(o.needs), color: o.needs ? ORANGE : GREY },
    { key: "down", label: "Down", value: String(o.down), color: o.down ? RED : GREY },
    { key: "hours", label: "Hours risk", value: String(o.hoursRisk), color: o.hoursRisk ? RED : GREY },
    { key: "compliance", label: "Compliance", value: String(o.complianceCount), color: o.complianceWorst === "expired" ? RED : o.complianceWorst === "expiring" ? ORANGE : o.complianceWorst === "soon" ? YELLOW : GREY },
    { key: "shift", label: "On shift", value: String(o.onShift), color: o.onShift ? WHITE : GREY },
    { key: "delayed", label: "Delayed", value: o.delayedMin ? hm(o.delayedMin) : "0", color: o.delayedMin ? ORANGE : GREY },
    { key: "callouts", label: "Call-outs", value: o.calloutsBlocking ? `${o.callouts}/${o.calloutsBlocking}` : String(o.callouts), unit: o.calloutsBlocking ? "blocking" : undefined, color: o.calloutsBlocking ? RED : o.callouts ? ORANGE : GREY },
    { key: "billable", label: "Billable", value: o.billableMin ? hm(o.billableMin) : "0", color: o.billableMin ? YELLOW : GREY },
  ];
}

// ── Day ribbon ─────────────────────────────────────────────────────────────────────────────────────────────
export type Activity = "driving" | "loading" | "delivering" | "terminal" | "delay";
export const ACTIVITY_COLOR: Record<Activity, string> = { driving: "#60a5fa", loading: "#4ade80", delivering: "#a78bfa", terminal: "#fbbf24", delay: "#f87171" };
export const ACTIVITY_LABEL: Record<Activity, string> = { driving: "Driving", loading: "Loading", delivering: "Delivering", terminal: "Terminal work", delay: "Delay" };
export type Source = "geotab" | "app" | "manual";
export type RawSeg = { userId: string; name: string; region: string | null; activity: Activity; from: number; to: number; source: Source };
export type RibbonSeg = { activity: Activity; left: number; width: number; source: Source };
export type RibbonLane = { userId: string; name: string; region: string | null; segs: RibbonSeg[] };

/** One lane per driver across [dayStart, dayEnd), segments clipped to the day and drawn in the order given (later on top). */
export function dayRibbon(raw: RawSeg[], dayStart: number, dayEnd: number, regions: Set<string>): RibbonLane[] {
  const span = dayEnd - dayStart;
  const lanes = new Map<string, RibbonLane>();
  for (const s of raw) {
    if (!inRegions(regions, s.region)) continue;
    const from = Math.max(s.from, dayStart), to = Math.min(s.to, dayEnd);
    if (!(to > from)) continue;
    const lane = lanes.get(s.userId) ?? { userId: s.userId, name: s.name, region: s.region, segs: [] };
    lane.segs.push({ activity: s.activity, left: (from - dayStart) / span, width: (to - from) / span, source: s.source });
    lanes.set(s.userId, lane);
  }
  return [...lanes.values()].sort((a, b) => a.name.localeCompare(b.name));
}

type TripIn = { userId: string; name: string; region: string | null; startedAt: string | null; completedAt: string | null; pickups: { arrived_at: string | null; left_at: string | null }[]; deliveries: { arrived_at: string | null; left_at: string | null }[] };
const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
/** A trip as segments: the whole trip is driving, with loading and delivering painted over it. */
export function tripSegments(trip: TripIn, nowMs: number): RawSeg[] {
  const start = t(trip.startedAt);
  if (!Number.isFinite(start)) return [];
  const end = Number.isFinite(t(trip.completedAt)) ? t(trip.completedAt) : nowMs;
  const base = { userId: trip.userId, name: trip.name, region: trip.region, source: "app" as Source };
  const out: RawSeg[] = [{ ...base, activity: "driving", from: start, to: end }];
  for (const p of trip.pickups) if (Number.isFinite(t(p.arrived_at))) out.push({ ...base, activity: "loading", from: t(p.arrived_at), to: Number.isFinite(t(p.left_at)) ? t(p.left_at) : nowMs });
  for (const d of trip.deliveries) if (Number.isFinite(t(d.arrived_at))) out.push({ ...base, activity: "delivering", from: t(d.arrived_at), to: Number.isFinite(t(d.left_at)) ? t(d.left_at) : nowMs });
  return out;
}

// ── Compliance heatmap ─────────────────────────────────────────────────────────────────────────────────────
const KIND_ROW: Record<string, string> = { access: "Terminal access", no_access: "Terminal access", license: "License", medical: "Medical card", twic: "TWIC", badge: "Port badges", permit: "Equipment permits", service: "Service due", training: "Terminal training" };
export type HeatItem = { subjectId: string; subject: string; label: string; state: ExpiryState };
export type HeatCell = { count: number; worst: ExpiryState | null; items: HeatItem[] };
export type Heatmap = { columns: string[]; rows: { label: string; cells: HeatCell[]; total: number }[] };
export type ExtraRow = { label: string; items: (HeatItem & { region: string | null })[] };

export function heatmap(alerts: PlanAlert[], regionOfSubject: (id: string) => string | null | undefined, extra: ExtraRow[], regions: Set<string>): Heatmap {
  const byRow = new Map<string, (HeatItem & { region: string })[]>();
  const add = (label: string, it: HeatItem, region: string | null | undefined) => {
    if (!inRegions(regions, region)) return;
    byRow.set(label, [...(byRow.get(label) ?? []), { ...it, region: regionName(region) }]);
  };
  for (const a of alerts) add(KIND_ROW[a.kind] ?? a.kind, { subjectId: a.subjectId, subject: a.subject, label: a.label, state: a.state }, regionOfSubject(a.subjectId));
  for (const e of extra) for (const it of e.items) add(e.label, it, it.region);
  const all = [...byRow.values()].flat();
  const columns = regionOptions(all.map((i) => i.region));
  const rows = [...byRow.entries()].map(([label, items]) => {
    const cells = columns.map((c): HeatCell => { const list = items.filter((i) => i.region === c); return { count: list.length, worst: worstState(list.map((i) => i.state)), items: list }; });
    return { label, cells, total: items.length };
  }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return { columns, rows };
}

// ── Campaign bars ──────────────────────────────────────────────────────────────────────────────────────────
export type CampaignBar = { id: string; name: string; due: string | null; total: number; done: number; outstanding: number; pending: number; closed: boolean };
export function campaignBars(boards: CampaignBoard[], includeClosed = false): CampaignBar[] {
  return boards.filter((b) => includeClosed || !b.campaign.closed_at).map((b) => ({ id: b.campaign.campaign_id, name: b.campaign.name, due: b.campaign.due_on, total: b.targets, done: b.done.length, outstanding: b.outstanding.length, pending: b.pendingReview, closed: !!b.campaign.closed_at }));
}
