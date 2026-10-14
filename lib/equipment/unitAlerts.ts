// lib/equipment/unitAlerts.ts
//
// Everything coming due on one truck or trailer: permits (registration,
// annual inspection, etc.) and service. Service is counted by date or by
// miles; miles are turned into days using that truck's own average miles per
// day, so every alert uses the same app-wide colors (lib/expiry.ts).
//
// Pure, so it can be tested without a session.

import { expiryStateForDays, daysUntilIso, type ExpiryState } from "../expiry.ts";

export const DEFAULT_MILES_PER_DAY = 500;
// Days of trip odometer history needed before a truck's own average is used.
export const MIN_RATE_SPAN_DAYS = 7;

export type PermitInput = { name: string; expiration_date: string | null };
export type ServiceTypeInput = {
  service_type_id: string;
  name: string;
  interval_kind: "miles" | "hours" | "duration" | "none";
  interval_value: number | null;
  applies_to: "truck" | "trailer" | "both";
  is_active: boolean;
};
export type ServiceRecordInput = { service_type_id: string; date: string; reading_value: number | null; created_at: string };
export type OdometerPoint = { miles: number; at: string };

export type UnitAlert = {
  kind: "permit" | "service";
  name: string;
  state: ExpiryState;
  days: number;           // whole days left (negative = overdue)
  detail: string;         // shown in the list, never in the square
};

export type UnitAlertSummary = {
  alerts: UnitAlert[];    // everything within 30 days or past due, worst first
  count: number;
  worst: ExpiryState | null;
};

const RANK: Record<ExpiryState, number> = { expired: 0, expiring: 1, soon: 2, valid: 3, not_set: 4, inactive: 5 };

// Average miles per day from trip odometer readings over the last 30 days.
export function milesPerDay(points: OdometerPoint[], nowMs: number): { rate: number; measured: boolean } {
  const recent = points
    .filter((p) => Number.isFinite(p.miles) && nowMs - Date.parse(p.at) <= 30 * 86400000)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (recent.length >= 2) {
    const first = recent[0], last = recent[recent.length - 1];
    const spanDays = (Date.parse(last.at) - Date.parse(first.at)) / 86400000;
    const miles = last.miles - first.miles;
    if (spanDays >= MIN_RATE_SPAN_DAYS && miles > 0) return { rate: miles / spanDays, measured: true };
  }
  return { rate: DEFAULT_MILES_PER_DAY, measured: false };
}

const fmtMi = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;

export function unitAlerts(input: {
  unit: "truck" | "trailer";
  permits: PermitInput[];
  types: ServiceTypeInput[];
  records: ServiceRecordInput[];
  odometer?: OdometerPoint[];   // truck only
  todayIso?: string;
  nowMs?: number;
}): UnitAlertSummary {
  const nowMs = input.nowMs ?? Date.now();
  const all: UnitAlert[] = [];

  for (const p of input.permits) {
    const days = daysUntilIso(p.expiration_date, input.todayIso);
    if (days == null) continue;
    all.push({ kind: "permit", name: p.name, state: expiryStateForDays(days), days,
      detail: days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago` : `Expires in ${days} day${days === 1 ? "" : "s"}` });
  }

  // Latest record of each service type that applies to this unit.
  const typeById = new Map(input.types.map((t) => [t.service_type_id, t]));
  const latest = new Map<string, ServiceRecordInput>();
  for (const r of input.records) {
    const t = typeById.get(r.service_type_id);
    if (!t || !t.is_active || (t.applies_to !== "both" && t.applies_to !== input.unit)) continue;
    const prev = latest.get(r.service_type_id);
    if (!prev || r.date > prev.date || (r.date === prev.date && r.created_at > prev.created_at)) latest.set(r.service_type_id, r);
  }

  const odo = input.odometer ?? [];
  const readings = [
    ...odo.map((p) => p.miles),
    ...input.records.map((r) => Number(r.reading_value)).filter((n) => Number.isFinite(n) && n > 0),
  ];
  const currentMiles = readings.length ? Math.max(...readings) : null;
  const { rate } = milesPerDay(odo, nowMs);

  for (const [typeId, rec] of latest) {
    const t = typeById.get(typeId)!;
    const every = Number(t.interval_value);
    if (!Number.isFinite(every) || every <= 0) continue;
    if (t.interval_kind === "duration") {
      const due = new Date(rec.date.slice(0, 10) + "T00:00:00Z");
      due.setUTCDate(due.getUTCDate() + every);
      const days = daysUntilIso(due.toISOString().slice(0, 10), input.todayIso);
      if (days == null) continue;
      all.push({ kind: "service", name: t.name, state: expiryStateForDays(days), days,
        detail: days < 0 ? `Overdue ${-days} day${days === -1 ? "" : "s"}` : `Due in ${days} day${days === 1 ? "" : "s"}` });
    } else if (t.interval_kind === "miles" && input.unit === "truck") {
      const last = Number(rec.reading_value);
      if (!Number.isFinite(last) || currentMiles == null) continue;
      const left = last + every - currentMiles;
      const days = Math.floor(left / rate);
      all.push({ kind: "service", name: t.name, state: expiryStateForDays(left < 0 ? -1 : days), days: left < 0 ? -1 : days,
        detail: left < 0 ? `Overdue by ${fmtMi(-left)}` : `Due in ${fmtMi(left)} (about ${days} day${days === 1 ? "" : "s"})` });
    }
    // Hours aren't counted: nothing records engine or trailer hours.
  }

  const alerts = all
    .filter((a) => a.state === "soon" || a.state === "expiring" || a.state === "expired")
    .sort((a, b) => RANK[a.state] - RANK[b.state] || a.days - b.days);
  return { alerts, count: alerts.length, worst: alerts[0]?.state ?? null };
}
