// lib/safety/onDuty.ts
//
// A safety meeting counts as on-duty time. The window is the meeting's start to its end (a meeting not ended yet
// runs to the moment the driver signed). Time the electronic log already shows as on duty or driving isn't counted
// twice. Per local day, split at midnight. Pure: no Supabase, no clock.

export type Window = { from: number; to: number };
export const MAX_MEETING_MIN = 8 * 60;
export const SAFETY_MEETING_EVENT = "safety_meeting";

/** The span a signed meeting counts for, or null when it can't be worked out (no start, or the end isn't after it). */
export function meetingWindow(m: { started_at: string | null; ended_at: string | null }, signedAt: string): Window | null {
  const from = m.started_at ? Date.parse(m.started_at) : NaN;
  const end = m.ended_at ? Date.parse(m.ended_at) : Date.parse(signedAt);
  if (!Number.isFinite(from) || !Number.isFinite(end) || end <= from) return null;
  return { from, to: Math.min(end, from + MAX_MEETING_MIN * 60_000) };
}

/** The window minus spans already on duty in the log (overlaps removed, so nothing counts twice). */
export function uncovered(w: Window, onDuty: Window[]): Window[] {
  let left: Window[] = [w];
  for (const s of [...onDuty].sort((a, b) => a.from - b.from)) {
    left = left.flatMap((p) => {
      if (s.to <= p.from || s.from >= p.to) return [p];
      const out: Window[] = [];
      if (s.from > p.from) out.push({ from: p.from, to: s.from });
      if (s.to < p.to) out.push({ from: s.to, to: p.to });
      return out;
    });
  }
  return left;
}

const dayKey = (ms: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** Hours per local date for a set of windows, split at local midnight. */
export function hoursByDay(ws: Window[], tz: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of ws) {
    let t = w.from;
    while (t < w.to) {
      const k = dayKey(t, tz);
      let end = Math.min(w.to, t + 3600_000);
      if (dayKey(end - 1, tz) !== k) { let lo = t, hi = end; while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (dayKey(mid, tz) === k) lo = mid; else hi = mid; } end = hi; }
      out[k] = (out[k] ?? 0) + (end - t) / 3_600_000;
      t = end;
    }
  }
  return out;
}

export const meetingMinutes = (w: Window | null): number => (w ? Math.round((w.to - w.from) / 60_000) : 0);
