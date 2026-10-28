// lib/reports/dateRange.ts
//
// A report's date range: local dates, both ends included. null = all time.

import { addDays, localDateOf, localMidnightMs } from "../worklog/time.ts";

export type DateRange = { start: string; end: string } | null;

export const deviceTz = () => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "") || "America/New_York";

/** The rolling default a report opens on before the company's own period is known. */
export function lastDays(n: number, now = Date.now(), tz = deviceTz()): { start: string; end: string } {
  const end = localDateOf(now, tz);
  return { start: addDays(end, -(n - 1)), end };
}

/** ISO bounds for a database query: start of the first day up to (not including) the day after the last. */
export function rangeBounds(r: NonNullable<DateRange>, tz = deviceTz()): { fromIso: string; toIso: string } {
  return { fromIso: new Date(localMidnightMs(r.start, tz)).toISOString(), toIso: new Date(localMidnightMs(addDays(r.end, 1), tz)).toISOString() };
}

export function inRange(iso: string | null | undefined, r: DateRange, tz = deviceTz()): boolean {
  if (!r) return true;
  if (!iso) return false;
  const t = Date.parse(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(t)) return false;
  const d = localDateOf(t, tz);
  return d >= r.start && d <= r.end;
}
