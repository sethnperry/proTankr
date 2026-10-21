// lib/dispatch/dutyGraph.ts
//
// The planned load drawn like a driver's logbook grid: one line that steps
// between Off Duty, Sleeper, Driving and On Duty over the hours of the day.
// Drive legs are Driving. Loading, the gauging hold and the drop are On Duty
// (working or waiting, not driving). Before and after the load is Off Duty.
// Sleeper is on the grid for reading it like a log; the forecast never uses it.

import type { Seg, SegKey } from "./forecast.ts";

export type DutyStatus = "off" | "sleeper" | "driving" | "on";

/** Top to bottom. Off duty and sleeper aren't charted: the graph is the working day only. */
export const DUTY_ROWS: { status: DutyStatus; label: string }[] = [
  { status: "driving", label: "D" },
  { status: "on", label: "ON" },
];

export function dutyFor(key: SegKey): DutyStatus {
  return key === "to_terminal" || key === "to_delivery" ? "driving" : "on";
}

export type DutyBlock = { status: DutyStatus; startMs: number; endMs: number; key: SegKey | "earlier" };

/** The blocks to draw: earlier loads in a day plan as On Duty, then this load's legs. */
export function dutyBlocks(segments: Seg[], earlier: { startMs: number; endMs: number }[] = []): DutyBlock[] {
  return [
    ...earlier.map((e) => ({ status: "on" as const, startMs: e.startMs, endMs: e.endMs, key: "earlier" as const })),
    ...segments.map((s) => ({ status: dutyFor(s.key), startMs: s.startMs, endMs: s.endMs, key: s.key })),
  ].sort((a, b) => a.startMs - b.startMs);
}

const HOUR = 3600000;
/** The most the chart spans when a long rested stretch is drawn before the first load (Alaska's 20 h day fits the loads themselves). */
const MAX_SPAN = 16 * HOUR;

/** The whole working day on one chart: the first load starts at the far left and the chart runs to the end of the last.
 *  A rested-and-waiting band is drawn before the start when it fits in MAX_SPAN; a longer one is cut off at the left edge. */
export function dutyRange(
  blocks: DutyBlock[],
  rest?: { fromMs: number; toMs: number } | null,
): { t0: number; t1: number; restFromMs: number | null; restClipped: boolean } {
  if (blocks.length === 0) {
    if (!rest) return { t0: 0, t1: HOUR * 4, restFromMs: null, restClipped: false };
    return { t0: rest.fromMs, t1: Math.max(rest.toMs, rest.fromMs + 4 * HOUR), restFromMs: rest.fromMs, restClipped: false };
  }
  const s = Math.min(...blocks.map((b) => b.startMs));
  const e = Math.max(...blocks.map((b) => b.endMs));
  let t0 = s;
  let restFromMs: number | null = null;
  let restClipped = false;
  if (rest && rest.fromMs < s) {
    const pad = Math.max(HOUR, MAX_SPAN - (e - s)); // always at least an hour of rested time, more when the day is short
    t0 = Math.max(rest.fromMs, s - pad);
    restFromMs = t0;
    restClipped = rest.fromMs < t0;
  }
  let t1 = Math.ceil(e / (15 * 60000)) * 15 * 60000;
  if (t1 - t0 < 4 * HOUR) t1 = t0 + 4 * HOUR;
  return { t0, t1, restFromMs, restClipped };
}

/** Where a time sits along the grid, 0 to 100. */
export function pct(ms: number, r: { t0: number; t1: number }): number {
  return ((ms - r.t0) / (r.t1 - r.t0)) * 100;
}

/** The stretch where a driver is rested and able to start but, going by history, usually hasn't yet:
 *  from when their 10-hour reset completes (or now, if it already has) to their typical start time.
 *  Null when they aren't resting, or their usual start is no later than they could start. */
export function restWindow(
  h: { status: string | null; offSince?: string | null } | null | undefined,
  typicalMin: number | null,
  nowMs: number = Date.now(),
): { fromMs: number; toMs: number } | null {
  if (!h || typicalMin == null) return null;
  const since = h.offSince ? Date.parse(h.offSince) : NaN;
  if (!h.status || !["OFF", "SB", "PC"].includes(h.status) || !Number.isFinite(since)) return null;
  const from = Math.max(nowMs, since + 600 * 60000);
  const d = new Date(nowMs); d.setHours(0, 0, 0, 0);
  let typical = d.getTime() + typicalMin * 60000;
  if (typical <= nowMs) typical += 24 * 3600000;
  return typical > from ? { fromMs: from, toMs: typical } : null;
}
