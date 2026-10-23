// lib/trips/delayReport.ts
//
// What the Company Dashboard's Delays screen shows: time drivers logged with the
// Delay button, and time past the drop estimate that a driver said had no
// reason ("unaccounted"). Delay can be billable, so a manager reads these
// differently from ordinary drive time. Unaccounted time is the one that needs
// a conversation, so it is listed on its own.

import { delayReasonLabel, loggedDelays, type DelayLeg } from "./delays.ts";
import type { TripDeliveryRow, TripEventRow, TripRow } from "./types.ts";

export type DelayReportInput = {
  trips: Pick<TripRow, "trip_id" | "driver_id" | "started_at">[];
  deliveries: Pick<TripDeliveryRow, "delivery_id" | "trip_id" | "unaccounted_delay_min" | "arrived_at" | "left_at" | "status" | "location_id" | "one_off_name">[];
  events: TripEventRow[];
};

export type ReasonTotal = { label: string; minutes: number; count: number };
export type DriverDelay = {
  driverId: string;
  loggedMin: number;
  unaccountedMin: number;
  delays: number;
  unaccountedDrops: number;
  byReason: ReasonTotal[];
  byLeg: Record<DelayLeg, number>;
};
export type UnaccountedDrop = { deliveryId: string; tripId: string; driverId: string; minutes: number; when: string | null; locationId: string | null; oneOffName: string | null };

export type DelayReport = {
  loggedMin: number;
  unaccountedMin: number;
  delays: number;
  byReason: ReasonTotal[];
  byDriver: DriverDelay[]; // most unaccounted first, then most logged
  unaccounted: UnaccountedDrop[]; // biggest first
};

const emptyLegs = (): Record<DelayLeg, number> => ({ to_rack: 0, at_rack: 0, to_drop: 0, at_drop: 0 });

function addReason(list: ReasonTotal[], label: string, minutes: number) {
  const hit = list.find((r) => r.label === label);
  if (hit) { hit.minutes += minutes; hit.count += 1; }
  else list.push({ label, minutes, count: 1 });
}

export function buildDelayReport(input: DelayReportInput): DelayReport {
  const driverOf = new Map(input.trips.map((t) => [t.trip_id, t.driver_id]));
  const drivers = new Map<string, DriverDelay>();
  const get = (id: string) => {
    let d = drivers.get(id);
    if (!d) { d = { driverId: id, loggedMin: 0, unaccountedMin: 0, delays: 0, unaccountedDrops: 0, byReason: [], byLeg: emptyLegs() }; drivers.set(id, d); }
    return d;
  };
  const byReason: ReasonTotal[] = [];
  let loggedMin = 0, delays = 0;

  const tripIds = new Set(input.trips.map((t) => t.trip_id));
  const delayEvents = input.events.filter((e) => tripIds.has(e.trip_id));
  const byTrip = new Map<string, TripEventRow[]>();
  for (const e of delayEvents) byTrip.set(e.trip_id, [...(byTrip.get(e.trip_id) ?? []), e]);
  for (const [tripId, evs] of byTrip) {
    const driver = driverOf.get(tripId);
    if (!driver) continue;
    for (const d of loggedDelays(evs)) {
      if (d.minutes <= 0) continue;
      const label = delayReasonLabel(d.code, d.note);
      const dd = get(driver);
      dd.loggedMin += d.minutes; dd.delays += 1;
      if (d.leg in dd.byLeg) dd.byLeg[d.leg] += d.minutes;
      addReason(dd.byReason, label, d.minutes);
      addReason(byReason, label, d.minutes);
      loggedMin += d.minutes; delays += 1;
    }
  }

  const unaccounted: UnaccountedDrop[] = [];
  let unaccountedMin = 0;
  for (const d of input.deliveries) {
    const m = d.unaccounted_delay_min ?? 0;
    if (m <= 0 || !tripIds.has(d.trip_id)) continue;
    const driver = driverOf.get(d.trip_id);
    if (!driver) continue;
    const dd = get(driver);
    dd.unaccountedMin += m; dd.unaccountedDrops += 1;
    unaccountedMin += m;
    unaccounted.push({ deliveryId: d.delivery_id, tripId: d.trip_id, driverId: driver, minutes: m, when: d.left_at ?? d.arrived_at, locationId: d.location_id, oneOffName: d.one_off_name });
  }

  const sortReasons = (l: ReasonTotal[]) => l.sort((a, b) => b.minutes - a.minutes);
  sortReasons(byReason);
  for (const d of drivers.values()) sortReasons(d.byReason);
  return {
    loggedMin, unaccountedMin, delays,
    byReason,
    byDriver: [...drivers.values()].sort((a, b) => b.unaccountedMin - a.unaccountedMin || b.loggedMin - a.loggedMin),
    unaccounted: unaccounted.sort((a, b) => b.minutes - a.minutes),
  };
}
