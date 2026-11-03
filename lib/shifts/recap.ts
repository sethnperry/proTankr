// lib/shifts/recap.ts
//
// The Shift pop-out's numbers: hours worked per day over the pay period (from the driver's shifts, split at local
// midnight), and when the next scheduled shift starts. Pure: no Supabase, no React, no clock.

import { hoursByDay } from "../safety/onDuty.ts";
import { localDateOf } from "../worklog/time.ts";
import type { Shift } from "./shiftLogic.ts";

export type RecapRow = { date: string; hours: number; today: boolean };
export type Recap = { rows: RecapRow[]; total: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Days worked in [start, end] (local dates), newest first. An open shift counts up to `nowMs`. Today shows up only
 * once a shift has run today (so the line appears when the driver starts).
 */
export function shiftRecap(shifts: Shift[], range: { start: string; end: string }, tz: string, nowMs: number): Recap {
  const windows = shifts.map((s) => ({ from: Date.parse(s.startedAt), to: s.endedAt ? Date.parse(s.endedAt) : nowMs })).filter((w) => Number.isFinite(w.from) && Number.isFinite(w.to) && w.to > w.from);
  const byDay = hoursByDay(windows, tz);
  const today = localDateOf(nowMs, tz);
  const rows: RecapRow[] = Object.entries(byDay)
    .filter(([d, h]) => d >= range.start && d <= range.end && h >= 0.05)
    .map(([date, h]) => ({ date, hours: r1(h), today: date === today }))
    .sort((a, b) => b.date.localeCompare(a.date));
  // A shift just started has no hours yet, but today's line should already be there.
  if (shifts.some((x) => !x.endedAt) && !rows.some((r) => r.today) && today >= range.start && today <= range.end) rows.unshift({ date: today, hours: 0, today: true });
  return { rows, total: r1(rows.reduce((t, r) => t + r.hours, 0)) };
}

export type Schedule = { days_of_week: number[]; shift_start_local: string | null };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (t: string) => t.slice(0, 5);

/** "Today 06:00", or the next scheduled day ("Tue 06:00"), or null when nothing is scheduled. */
export function scheduledStart(s: Schedule | null, nowMs: number, tz: string): string | null {
  if (!s || !s.shift_start_local || !s.days_of_week?.length) return null;
  const todayIso = localDateOf(nowMs, tz);
  const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.parse(`${todayIso}T12:00:00Z`) + i * 86400_000).toISOString().slice(0, 10);
    if (s.days_of_week.includes(dow(d))) return `${i === 0 ? "Today" : i === 1 ? "Tomorrow" : DOW[dow(d)]} ${hhmm(s.shift_start_local)}`;
  }
  return null;
}

/** "Tue 11/3" for a local date. */
export function recapDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${m}/${d}`;
}
