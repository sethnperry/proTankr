// lib/worklog/dutyHours.ts
//
// Driving and on-duty (not driving) minutes per local day, from the driver's duty-status logs.
// Days split at local midnight in the driver's time zone. Pure.

import { segments } from "../telematics/cycleRecap.ts";

export type DayHours = { date: string; driveMin: number; onDutyMin: number };

function dayKey(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** Per-day minutes for every day from `fromDate` to `toDate` (YYYY-MM-DD, inclusive), even with no activity. */
export function dailyHours(logs: any[], tz: string, fromDate: string, toDate: string, nowMs: number = Date.now()): DayHours[] {
  const drive = new Map<string, number>();
  const duty = new Map<string, number>();
  for (const s of segments(logs, nowMs)) {
    if (s.code !== "D" && s.code !== "ON" && s.code !== "YM") continue;
    let t = s.from;
    while (t < s.to) {
      const k = dayKey(t, tz);
      let end = Math.min(s.to, t + 3600_000);
      if (dayKey(end - 1, tz) !== k) {
        let lo = t, hi = end;
        while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (dayKey(mid, tz) === k) lo = mid; else hi = mid; }
        end = hi;
      }
      const m = (end - t) / 60000;
      (s.code === "D" ? drive : duty).set(k, ((s.code === "D" ? drive : duty).get(k) ?? 0) + m);
      t = end;
    }
  }
  const out: DayHours[] = [];
  for (let d = Date.parse(`${fromDate}T12:00:00Z`); d <= Date.parse(`${toDate}T12:00:00Z`); d += 86400_000) {
    const k = new Date(d).toISOString().slice(0, 10);
    out.push({ date: k, driveMin: Math.round(drive.get(k) ?? 0), onDutyMin: Math.round(duty.get(k) ?? 0) });
  }
  return out;
}
