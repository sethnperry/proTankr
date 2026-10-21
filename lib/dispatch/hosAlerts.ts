// lib/dispatch/hosAlerts.ts
//
// The LIVE board's Hours gauge: drivers on loads in progress whose real clocks
// are running low. Pure.

import type { HosAvailability } from "../telematics/types.ts";
import { hosText } from "../telematics/progress.ts";

export type HosAlert = { tripId: string; userId: string; driverName: string; truckName: string | null; text: string; color: string; level: "red" | "orange"; leastMin: number };

export const HOS_ORANGE_MIN = 120;
export const HOS_RED_MIN = 60;

export function hosAlerts(
  trips: { tripId: string; userId: string | null; driverName: string | null; truckName: string | null }[],
  hos: Map<string, HosAvailability>,
  nowMs: number,
): HosAlert[] {
  const out: HosAlert[] = [];
  const seen = new Set<string>();
  for (const t of trips) {
    if (!t.userId || seen.has(t.userId)) continue;
    const h = hos.get(t.userId);
    if (!h) continue;
    const least = Math.min(h.driveLeftMin ?? Infinity, h.dutyLeftMin ?? Infinity);
    if (!Number.isFinite(least) || least >= HOS_ORANGE_MIN) continue;
    seen.add(t.userId);
    const x = hosText(h, nowMs);
    out.push({ tripId: t.tripId, userId: t.userId, driverName: t.driverName ?? "Driver", truckName: t.truckName, text: x.text, color: x.color, level: least < HOS_RED_MIN ? "red" : "orange", leastMin: least });
  }
  return out.sort((a, b) => a.leastMin - b.leastMin);
}
