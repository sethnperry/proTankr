// lib/push/hosAlertCore.ts
//
// Decides which push notifications the hours-of-service check should send,
// from what each driver on a load has left, where the truck is, and what was
// already announced. Pure: the cron route feeds it data and sends the result.
//
//   driver  : "your hours won't cover this trip" (newly tight / bad)
//   dispatch: "<driver> is low on hours" (newly under 2 h, or under 1 h)

import { airMiles, type LatLon } from "../trips/deliveryLocations.ts";
import { DROP_STOP_MIN, LOAD_STOP_MIN, remainingDriveMin, tripHosCheck } from "../telematics/progress.ts";
import { shouldNotifyHosTrip, type Level } from "../telematics/hosTripNotify.ts";

export type DriverCase = {
  userId: string;
  name: string;
  truckName: string | null;
  hos: { driveLeftMin: number | null; dutyLeftMin: number | null; at: string } | null;
  pos: { lat: number; lon: number; at: string | null } | null;
  racksLeft: (LatLon | null)[];   // pickups not left yet, in order
  dropsLeft: (LatLon | null)[];   // deliveries not done, in order
  prevTrip: Level | null;         // last announced trip-vs-clocks level
  prevLow: "orange" | "red" | null; // last announced low-clocks level
};

export type PlannedNotification = { to: "driver" | "staff"; userId: string; title: string; body: string; url: string; tag: string };
export type NextState = { userId: string; trip: Level; low: "orange" | "red" | "none" };

const FRESH_POS_MS = 10 * 60_000;
const FRESH_HOS_MS = 15 * 60_000;
const h = (m: number) => `${(Math.max(0, m) / 60).toFixed(1)} h`;

export function planHosAlerts(cases: DriverCase[], nowMs: number): { notifications: PlannedNotification[]; state: NextState[] } {
  const notifications: PlannedNotification[] = [];
  const state: NextState[] = [];
  for (const c of cases) {
    const hos = c.hos && nowMs - Date.parse(c.hos.at) <= FRESH_HOS_MS ? c.hos : null;
    if (!hos) continue; // no fresh clocks: leave the state as it was
    const least = Math.min(hos.driveLeftMin ?? Infinity, hos.dutyLeftMin ?? Infinity);

    // Low clocks, for dispatch.
    const low: "orange" | "red" | "none" = !Number.isFinite(least) || least >= 120 ? "none" : least < 60 ? "red" : "orange";
    if (low !== "none" && (c.prevLow == null || (c.prevLow === "orange" && low === "red"))) {
      const parts = [hos.driveLeftMin != null ? `${h(hos.driveLeftMin)} drive` : null, hos.dutyLeftMin != null ? `${h(hos.dutyLeftMin)} window` : null].filter(Boolean).join(" · ");
      notifications.push({ to: "staff", userId: c.userId, title: `${c.name} is low on hours`, body: `${parts}${c.truckName ? ` · Truck ${c.truckName}` : ""}`, url: "/planner/dispatch", tag: `hos-low-${c.userId}` });
    }

    // Clocks vs the rest of the trip, for the driver (needs a fresh truck position and known stops).
    let trip: Level = "ok";
    const stops = [...c.racksLeft, ...c.dropsLeft];
    if (c.pos && c.pos.at && nowMs - Date.parse(c.pos.at) <= FRESH_POS_MS && stops.length) {
      const check = tripHosCheck({
        driveLeftMin: hos.driveLeftMin, dutyLeftMin: hos.dutyLeftMin,
        remainingDriveMin: remainingDriveMin({ lat: c.pos.lat, lon: c.pos.lon }, stops),
        stopMin: c.racksLeft.length * LOAD_STOP_MIN + c.dropsLeft.length * DROP_STOP_MIN,
      });
      trip = check ? check.level : "ok";
      if (check && shouldNotifyHosTrip(c.prevTrip ?? "ok", trip)) {
        notifications.push({ to: "driver", userId: c.userId, title: check.level === "bad" ? "Your hours won't cover this trip" : "Your hours are tight for this trip", body: check.text, url: "/planner/home", tag: "hos-trip" });
      }
    } else {
      trip = c.prevTrip ?? "ok"; // can't tell right now: keep what we last knew
    }
    state.push({ userId: c.userId, trip, low });
  }
  return { notifications, state };
}

export { airMiles };
