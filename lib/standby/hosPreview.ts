// lib/standby/hosPreview.ts
//
// The standby calculator: a driver picks a block of extra hours and sees what it does to their 70-hour cycle.
// Rolling 8 days: the cycle a block counts against is the 8 local days ending on the day worked, so hours from
// 8 days ago have dropped off by then. Uses the on-duty minutes per day the app already reads from Geotab
// (cycleRecap). An estimate: it assumes the whole block is worked on duty and nothing else is planned.
// Pure; no network.

export const CYCLE_LIMIT_MIN = 70 * 60;
export const RESTART_MIN = 34 * 60;
const STEP_MIN = 15;

export type RecapDayLite = { date: string; minutes: number };
export type HosPreview = {
  blockMin: number;
  /** Cycle minutes available right as the block starts (nothing else planned). */
  availableAtStartMin: number;
  /** Cycle minutes left after working the whole block (0 when it doesn't fit). */
  leftAfterMin: number;
  /** Minutes of the block that don't fit in the cycle. */
  shortByMin: number;
  /** When the cycle runs out inside the block, else null. */
  runsOutAtMs: number | null;
  /** When the 34-hour reset completes if they stop working at the block's end (or when the cycle ran out). */
  restartDoneAtMs: number;
  /** A block longer than the 14-hour on-duty window. */
  over14: boolean;
};

export function dayKey(ms: number, tz?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** "2026-11-24" minus n days, as the same format. */
export function dayMinus(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

export function hosPreview(i: { recapDays: RecapDayLite[]; startMs: number; endMs: number; tz?: string; limitMin?: number }): HosPreview {
  const limit = i.limitMin ?? CYCLE_LIMIT_MIN;
  const base = new Map(i.recapDays.map((d) => [d.date, d.minutes]));
  const planned = new Map<string, number>();
  const usedOn = (key: string) => {
    let t = 0;
    for (let k = 0; k < 8; k++) { const dk = dayMinus(key, k); t += (base.get(dk) ?? 0) + (planned.get(dk) ?? 0); }
    return t;
  };
  const blockMin = Math.max(0, Math.round((i.endMs - i.startMs) / 60000));
  const availableAtStartMin = Math.max(0, limit - usedOn(dayKey(i.startMs, i.tz)));
  let worked = 0;
  let runsOutAtMs: number | null = null;
  for (let t = i.startMs; t < i.endMs; t += STEP_MIN * 60000) {
    const key = dayKey(t, i.tz);
    if (usedOn(key) >= limit) { runsOutAtMs = t; break; }
    const add = Math.min(STEP_MIN, Math.round((i.endMs - t) / 60000));
    planned.set(key, (planned.get(key) ?? 0) + add);
    worked += add;
  }
  const endKey = dayKey(i.endMs - 1, i.tz);
  return {
    blockMin,
    availableAtStartMin,
    leftAfterMin: Math.max(0, limit - usedOn(runsOutAtMs != null ? dayKey(runsOutAtMs, i.tz) : endKey)),
    shortByMin: Math.max(0, blockMin - worked),
    runsOutAtMs,
    restartDoneAtMs: (runsOutAtMs ?? i.endMs) + RESTART_MIN * 60000,
    over14: blockMin > 14 * 60,
  };
}

export const fmtHours = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;
