// lib/dispatch/dutyGraph.ts
//
// The planned load drawn like a driver's logbook grid: one line that steps
// between Off Duty, Sleeper, Driving and On Duty over the hours of the day.
// Drive legs are Driving. Loading, the gauging hold and the drop are On Duty
// (working or waiting, not driving). Before and after the load is Off Duty.
// Sleeper is on the grid for reading it like a log; the forecast never uses it.

import type { Seg, SegKey } from "./forecast.ts";

export type DutyStatus = "off" | "sleeper" | "driving" | "on";

/** Top to bottom, as on a paper log. */
export const DUTY_ROWS: { status: DutyStatus; label: string }[] = [
  { status: "off", label: "OFF" },
  { status: "sleeper", label: "SB" },
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

/** The grid's time range: whole hours around the blocks, at least 4 hours wide. */
export function dutyRange(blocks: DutyBlock[]): { t0: number; t1: number } {
  if (blocks.length === 0) return { t0: 0, t1: HOUR * 4 };
  const lo = Math.min(...blocks.map((b) => b.startMs));
  const hi = Math.max(...blocks.map((b) => b.endMs));
  let t0 = Math.floor(lo / HOUR) * HOUR;
  let t1 = Math.ceil(hi / HOUR) * HOUR;
  if (t1 - t0 < 4 * HOUR) t1 = t0 + 4 * HOUR;
  return { t0, t1 };
}

/** Where a time sits along the grid, 0 to 100. */
export function pct(ms: number, r: { t0: number; t1: number }): number {
  return ((ms - r.t0) / (r.t1 - r.t0)) * 100;
}
