// lib/reports/periodOptions.ts
//
// Date ranges a report can be run for, built from the period the driver or company set
// (every week, every 2 weeks, twice a month, monthly) plus the usual calendar ranges. One list
// for every report, so the choices stay the same everywhere. Pure.

import { generatePayPeriods, type PayPeriodType } from "../../app/admin/payPeriods.ts";
import { addDays } from "../worklog/time.ts";

export type PeriodSettings = { type: PayPeriodType; anchor: string };
export type PeriodOption = { id: string; label: string; start: string; end: string; group: "period" | "calendar" };

const mmdd = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${m}/${d}`; };
const range = (a: string, b: string) => `${mmdd(a)} to ${mmdd(b)}`;

export const PERIOD_TITLE: Record<PayPeriodType, string> = { weekly: "Weekly", biweekly: "Biweekly", semi_monthly: "Semi-monthly", monthly: "Monthly" };

export function periodOptions(s: PeriodSettings | null, today: string): PeriodOption[] {
  const out: PeriodOption[] = [];
  if (s) {
    const list = generatePayPeriods(s.type, s.anchor, 8, today); // newest first; [0] holds today
    list.forEach((p, i) => out.push({
      id: `p:${p.start}`, start: p.start, end: i === 0 ? today < p.end ? today : p.end : p.end, group: "period",
      label: i === 0 ? `This period (${range(p.start, p.end)})` : i === 1 ? `Last period (${range(p.start, p.end)})` : range(p.start, p.end),
    }));
  }
  const [y, m] = today.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastMonthEnd = addDays(first, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;
  out.push(
    { id: "m:this", label: "This month", start: first, end: today, group: "calendar" },
    { id: "m:last", label: "Last month", start: lastMonthStart, end: lastMonthEnd, group: "calendar" },
    { id: "y:ytd", label: `Year to date (${y})`, start: `${y}-01-01`, end: today, group: "calendar" },
    { id: "y:last", label: `Last year (${y - 1})`, start: `${y - 1}-01-01`, end: `${y - 1}-12-31`, group: "calendar" },
  );
  return out;
}

/** Longer than a month and a bit: the email shows totals by month instead of every day. */
export function isLongRange(start: string, end: string): boolean {
  return (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000 > 35;
}

/** The most recent finished period as of `today`, or null. */
export function lastFinishedPeriod(s: PeriodSettings, today: string) {
  return generatePayPeriods(s.type, s.anchor, 4, today).find((p) => p.end < today) ?? null;
}
