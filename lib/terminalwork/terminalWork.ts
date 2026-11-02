// lib/terminalwork/terminalWork.ts
//
// Terminal and transload work with a timer: the activities, the billable default per activity (the company's own
// if it set one), starting and stopping a record, an admin's override with its history, and the billable terminal
// time report. Pure: no Supabase.

import { newId, type TripStore } from "../trips/tripStore.ts";
import type { TerminalWorkRow } from "../trips/types.ts";
import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export type { TerminalWorkRow };
export type Activity = TerminalWorkRow["activity"];

export const ACTIVITIES: { value: Activity; label: string; billable: boolean }[] = [
  { value: "rail_transload", label: "Rail transload", billable: true },
  { value: "vessel_transload", label: "Vessel transload", billable: true },
  { value: "marshaling", label: "Marshaling", billable: true },
  { value: "truck_to_tank", label: "Truck-to-tank transfer", billable: true },
  { value: "loading_for_others", label: "Loading product for others", billable: true },
  { value: "yard_work", label: "Yard work", billable: false },
  { value: "training", label: "Training", billable: false },
];
export const activityLabel = (a: string) => ACTIVITIES.find((x) => x.value === a)?.label ?? a;

/** The company's default for an activity: what it set, else the built-in one. */
export function billableDefault(activity: Activity, companyDefaults: Partial<Record<Activity, boolean>>): boolean {
  return companyDefaults[activity] ?? ACTIVITIES.find((a) => a.value === activity)?.billable ?? false;
}

export function startProblem(activity: Activity | null, terminalName: string): string | null {
  if (!activity) return "Pick what you're doing.";
  if (!terminalName.trim()) return "Pick the terminal.";
  return null;
}

/** Starts the timer. Only one can run at a time for a driver: the caller checks `running` first. */
export function startWork(store: TripStore, o: {
  companyId: string; userId: string; activity: Activity; terminalId: string | null; terminalName: string; productId: string | null;
  defaults: Partial<Record<Activity, boolean>>; nowIso: string; id?: string;
}): TerminalWorkRow {
  const id = o.id ?? newId();
  const existing = store.get("terminal_work", id);
  if (existing) return existing;
  const row: TerminalWorkRow = {
    work_id: id, company_id: o.companyId, user_id: o.userId, activity: o.activity, terminal_id: o.terminalId, terminal_name: o.terminalName.trim() || null,
    product_id: o.productId, started_at: o.nowIso, ended_at: null, note: null, billable: billableDefault(o.activity, o.defaults), source: "app",
  };
  store.put("terminal_work", row);
  return row;
}

export function stopWork(store: TripStore, id: string, nowIso: string, note?: string): TerminalWorkRow | null {
  const w = store.get("terminal_work", id);
  if (!w || w.ended_at) return w ?? null;
  const next: TerminalWorkRow = { ...w, ended_at: Date.parse(nowIso) >= Date.parse(w.started_at) ? nowIso : w.started_at, note: note?.trim() || w.note };
  store.put("terminal_work", next);
  return next;
}

/** The driver's running timer, if any (newest if somehow more than one). */
export const running = (rows: TerminalWorkRow[], userId: string): TerminalWorkRow | null =>
  rows.filter((r) => r.user_id === userId && !r.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;

export const minutesOf = (r: Pick<TerminalWorkRow, "started_at" | "ended_at">, nowMs: number): number =>
  Math.max(0, Math.round(((r.ended_at ? Date.parse(r.ended_at) : nowMs) - Date.parse(r.started_at)) / 60_000));

export const clock = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

// ── An admin's override, with history ───────────────────────────────────────────────────────────────────────
export type Override = { work_id: string; billable: boolean; note: string | null; set_by: string | null; set_at: string };

/** The decision in force: the latest override, else what the default was when the work started. */
export function effectiveBillable(r: Pick<TerminalWorkRow, "work_id" | "billable">, overrides: Override[]): { billable: boolean; overridden: boolean } {
  const mine = overrides.filter((o) => o.work_id === r.work_id).sort((a, b) => b.set_at.localeCompare(a.set_at));
  return mine[0] ? { billable: mine[0].billable, overridden: true } : { billable: r.billable, overridden: false };
}
export const historyOf = (workId: string, overrides: Override[]) => overrides.filter((o) => o.work_id === workId).sort((a, b) => b.set_at.localeCompare(a.set_at));

// ── The report ──────────────────────────────────────────────────────────────────────────────────────────────
export type WorkReportRow = TerminalWorkRow & { minutes: number; effective: boolean; overridden: boolean };

export function reportRows(rows: TerminalWorkRow[], overrides: Override[], nowMs: number): WorkReportRow[] {
  return rows.map((r) => { const e = effectiveBillable(r, overrides); return { ...r, minutes: minutesOf(r, nowMs), effective: e.billable, overridden: e.overridden }; })
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

const mdy = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };

export function workColumns(nameOf: (id: string) => string, productOf: (id: string | null) => string): ShellColumn<WorkReportRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => mdy(r.started_at), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.user_id), weight: 1.1 },
    { key: "terminal", label: "Terminal", get: (r) => r.terminal_name ?? "", weight: 1.3 },
    { key: "activity", label: "Activity", get: (r) => activityLabel(r.activity), weight: 1.3 },
    { key: "product", label: "Product", get: (r) => productOf(r.product_id), weight: 0.9 },
    { key: "time", label: "Time", get: (r) => (r.ended_at ? clock(r.minutes) : "running"), align: "r", weight: 0.7 },
    { key: "billable", label: "Billable", get: (r) => (r.effective ? "Yes" : "No") + (r.overridden ? " *" : ""), weight: 0.8 },
  ];
}

export function workFilters(nameOf: (id: string) => string): ShellFilter<WorkReportRow>[] {
  return [
    { id: "terminal", label: "Terminal", of: (r) => r.terminal_name ?? "" },
    { id: "activity", label: "Activity", of: (r) => r.activity, show: activityLabel },
    { id: "driver", label: "Driver", of: (r) => r.user_id, show: nameOf },
    { id: "billable", label: "Billing", of: (r) => (r.effective ? "yes" : "no"), show: (v) => (v === "yes" ? "Billable" : "Not billable") },
  ];
}

export function workSummary(rows: WorkReportRow[]): { label: string; value: string }[] {
  const sum = (f: (r: WorkReportRow) => boolean) => rows.filter((r) => r.ended_at && f(r)).reduce((t, r) => t + r.minutes, 0);
  return [{ label: "Billable", value: clock(sum((r) => r.effective)) }, { label: "Not billable", value: clock(sum((r) => !r.effective)) }, { label: "Records", value: String(rows.length) }];
}

/** Finished time per terminal, billable and not, for the "by terminal" block of the report. */
export function byTerminal(rows: WorkReportRow[]): { terminal: string; billable: number; notBillable: number }[] {
  const m = new Map<string, { billable: number; notBillable: number }>();
  for (const r of rows) {
    if (!r.ended_at) continue;
    const k = r.terminal_name || "Unknown terminal";
    const t = m.get(k) ?? { billable: 0, notBillable: 0 };
    if (r.effective) t.billable += r.minutes; else t.notBillable += r.minutes;
    m.set(k, t);
  }
  return [...m.entries()].map(([terminal, t]) => ({ terminal, ...t })).sort((a, b) => b.billable - a.billable || a.terminal.localeCompare(b.terminal));
}
