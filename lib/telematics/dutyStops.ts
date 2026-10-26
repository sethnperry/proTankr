// lib/telematics/dutyStops.ts
//
// Each time a driver stopped driving, from Geotab duty logs. The ELD keeps its
// own clock and uploads when it has signal, so a stop made in a dead zone still
// arrives later with its real time. The Driver Dashboard asks about these
// ("did you arrive, or was there a delay?") instead of the driver typing times.

import type { DutyCode } from "./dutyLogs.ts";
import { segments } from "./cycleRecap.ts";

export type DrivingStop = {
  /** ISO time the driver stopped driving (the duty status changed away from Driving). */
  at: string;
  /** The status they changed to. */
  code: DutyCode;
  /** ISO time driving started again, or null while still stopped. */
  resumedAt: string | null;
};

/** Stops from the last `windowMs`, oldest first. Very short ones (under `minSec`) are ignored as log noise. */
export function drivingStops(logs: any[], nowMs: number, windowMs = 24 * 3600_000, minSec = 60): DrivingStop[] {
  const segs = segments(logs, nowMs);
  const out: DrivingStop[] = [];
  for (let i = 0; i + 1 < segs.length; i++) {
    if (segs[i].code !== "D" || segs[i + 1].code === "D") continue;
    const at = segs[i + 1].from;
    if (nowMs - at > windowMs) continue;
    const next = segs.slice(i + 2).find((s) => s.code === "D");
    if (next && next.from - at < minSec * 1000) continue;
    out.push({ at: new Date(at).toISOString(), code: segs[i + 1].code, resumedAt: next ? new Date(next.from).toISOString() : null });
  }
  return out;
}
