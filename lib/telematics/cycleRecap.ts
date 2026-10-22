// lib/telematics/cycleRecap.ts
//
// Cycle recap and break clock, worked out from the driver's duty-status logs
// (not from Geotab's own recap fields, which were never verified).
// On duty = Driving + On Duty (+ yard move). Days split at local midnight in
// the driver's time zone. Pure; no network.

import { dutyCodeOf, isDutyChange, type DutyCode } from "./dutyLogs.ts";

export const CYCLE_LIMIT_MIN = 70 * 60;
export const BREAK_AFTER_DRIVE_MIN = 8 * 60;
export const BREAK_REST_MIN = 30;

export type RecapDay = { date: string; minutes: number };
export type CycleRecap = { days: RecapDay[]; usedMin: number; availableTomorrowMin: number; limitMin: number };

type Seg = { code: DutyCode; from: number; to: number };

function segments(logs: any[], nowMs: number): Seg[] {
  const rows = (logs ?? [])
    .filter(isDutyChange)
    .map((l) => ({ code: dutyCodeOf(l.status)!, t: Date.parse(l.dateTime) }))
    .filter((r) => Number.isFinite(r.t))
    .map((r) => ({ ...r, t: Math.min(r.t, nowMs) })) // a log stamped a few seconds ahead still counts
    .sort((a, b) => a.t - b.t);
  const out: Seg[] = [];
  for (let i = 0; i < rows.length; i++) {
    out.push({ code: rows[i].code, from: rows[i].t, to: Math.min(rows[i + 1]?.t ?? nowMs, nowMs) });
  }
  return out;
}

const ONDUTY = new Set<DutyCode>(["D", "ON", "YM"]);

function dayKey(ms: number, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Minutes of on-duty time per local day for the last `dayCount` days, oldest first, today last. */
export function cycleRecap(logs: any[], nowMs: number, tz: string, dayCount = 8, limitMin = CYCLE_LIMIT_MIN): CycleRecap {
  const per = new Map<string, number>();
  for (const s of segments(logs, nowMs)) {
    if (!ONDUTY.has(s.code)) continue;
    // walk the segment in hour-ish steps so a midnight inside it splits correctly
    let t = s.from;
    while (t < s.to) {
      const k = dayKey(t, tz);
      let end = Math.min(s.to, t + 3600_000);
      // shrink to the day boundary if the next step lands on another day
      if (dayKey(end - 1, tz) !== k) {
        let lo = t, hi = end;
        while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (dayKey(mid, tz) === k) lo = mid; else hi = mid; }
        end = hi;
      }
      per.set(k, (per.get(k) ?? 0) + (end - t) / 60000);
      t = end;
    }
  }
  const days: RecapDay[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const k = dayKey(nowMs - i * 86400_000, tz);
    days.push({ date: k, minutes: Math.round(per.get(k) ?? 0) });
  }
  const usedMin = days.reduce((a, d) => a + d.minutes, 0);
  // Tomorrow's window is tomorrow plus the 7 days up to and including today.
  const lastSeven = days.slice(-7).reduce((a, d) => a + d.minutes, 0);
  return { days, usedMin, availableTomorrowMin: Math.max(0, limitMin - lastSeven), limitMin };
}

/** Driving time left before the 30-minute break rule bites: 8 h of driving since the last 30+ min stretch of not driving. */
export function breakLeftMin(logs: any[], nowMs: number): number | null {
  const segs = segments(logs, nowMs);
  if (!segs.length) return null;
  let drove = 0;
  let rest = 0;
  for (const s of segs) {
    const len = (s.to - s.from) / 60000;
    if (s.code === "D") { drove += len; rest = 0; }
    else {
      rest += len;
      if (rest >= BREAK_REST_MIN) drove = 0;
    }
  }
  return Math.max(0, Math.round(BREAK_AFTER_DRIVE_MIN - drove));
}

export const WORKDAY_MIN = 14 * 60;
export const RESET_OFF_MIN = 10 * 60;

/** The 14-hour window: it opens when on-duty time starts after 10 straight hours off, and runs on the wall clock.
 * Null when there is nothing to go on or the driver is fresh off a reset (a full window). */
export function workdayLeftMin(logs: any[], nowMs: number): number | null {
  const segs = segments(logs, nowMs);
  if (!segs.length) return null;
  let windowStart: number | null = null;
  let off = 0;
  for (const s of segs) {
    const len = (s.to - s.from) / 60000;
    if (ONDUTY.has(s.code)) {
      if (windowStart == null || off >= RESET_OFF_MIN) windowStart = s.from;
      off = 0;
    } else {
      off += len;
    }
  }
  if (windowStart == null) return null;
  if (off >= RESET_OFF_MIN) return null; // reset since the last duty: next window hasn't opened
  return Math.max(0, Math.round(WORKDAY_MIN - (nowMs - windowStart) / 60000));
}
