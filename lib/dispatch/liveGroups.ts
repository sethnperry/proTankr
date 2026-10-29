// lib/dispatch/liveGroups.ts
//
// The Live Dispatch Dashboard's chips: where every load in progress is right now.
//   En route   heading to a rack (to load) or to a store (to deliver)
//   On site    at a rack (loading) or at a store (unloading)
//   Delayed    on site longer than the company's delay threshold
// Pure: takes the trips the board already has.

import type { FleetTrip } from "../trips/useFleetTrips.ts";
import { deliveryPlace, type Place } from "../trips/fleetProgress.ts";

export type LiveKind = "to_rack" | "to_drop" | "loading" | "unloading";

export type LiveRow = {
  tripId: string;
  kind: LiveKind;
  driverName: string;
  truckName: string | null;
  trailerName: string | null;
  where: string;          // the rack or store it's headed to / at
  place: string | null;   // "Tampa, FL"
  sinceIso: string | null;
  minutes: number | null; // time on site, or since the leg began
  delayed: boolean;
  orders: string[];
};

export const KIND_LABEL: Record<LiveKind, string> = {
  to_rack: "To load", to_drop: "To deliver", loading: "Loading", unloading: "Unloading",
};

const done = (s: string | null | undefined) => s === "complete" || s === "cancelled";
const minutesSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60000)) : null);
const placeText = (p: { city?: string | null; state?: string | null } | null | undefined) => [p?.city, p?.state].filter(Boolean).join(", ") || null;

export function classifyLive(
  trips: FleetTrip[], locations: Map<string, Place>, now: number,
  threshold: { loading: number; delivery: number },
): LiveRow[] {
  const out: LiveRow[] = [];
  for (const ft of trips) {
    if (ft.trip.status === "parked" || ft.trip.status === "dispatched" || ft.trip.status === "complete" || ft.trip.status === "cancelled") continue;
    const base = {
      tripId: ft.trip.trip_id, driverName: ft.driverName ?? "Driver", truckName: ft.truckName, trailerName: ft.trailerName, orders: ft.orderNumbers,
    };
    const pickups = [...ft.pickups].filter((p) => p.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
    const drops = [...ft.deliveries].filter((d) => !done(d.status)).sort((a, b) => a.seq - b.seq);

    const atRack = pickups.find((p) => p.arrived_at && !p.left_at);
    if (atRack) {
      const minutes = minutesSince(atRack.arrived_at, now);
      out.push({ ...base, kind: "loading", where: atRack.name ?? "Rack", place: placeText(atRack), sinceIso: atRack.arrived_at, minutes, delayed: (minutes ?? 0) >= threshold.loading });
      continue;
    }
    const atDrop = drops.find((d) => d.arrived_at && !d.left_at);
    if (atDrop) {
      const minutes = minutesSince(atDrop.arrived_at, now);
      const pl = deliveryPlace(atDrop, locations);
      out.push({ ...base, kind: "unloading", where: pl.name ?? "Delivery", place: placeText(pl), sinceIso: atDrop.arrived_at, minutes, delayed: (minutes ?? 0) >= threshold.delivery });
      continue;
    }
    const nextRack = pickups.find((p) => !p.arrived_at && !p.left_at);
    const loadedAboard = ft.compLoads.some((c) => c.disposition === "loaded");
    if (nextRack && !(loadedAboard && !pickups.some((p) => !p.arrived_at))) {
      // Heading to a rack: the leg began when the trip did, or when the last rack was left.
      const since = [...pickups].reverse().find((p) => p.left_at)?.left_at ?? ft.trip.started_at ?? null;
      out.push({ ...base, kind: "to_rack", where: nextRack.name ?? "Rack", place: placeText(nextRack), sinceIso: since, minutes: minutesSince(since, now), delayed: false });
      continue;
    }
    const nextDrop = drops.find((d) => !d.arrived_at);
    if (nextDrop) {
      const pl = deliveryPlace(nextDrop, locations);
      const since = [...pickups].reverse().find((p) => p.left_at)?.left_at ?? ft.trip.started_at ?? null;
      out.push({ ...base, kind: "to_drop", where: pl.name ?? "Delivery", place: placeText(pl), sinceIso: since, minutes: minutesSince(since, now), delayed: false });
    }
  }
  return out;
}

export function filterLive(rows: LiveRow[], query: string): LiveRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => [r.driverName, r.truckName, r.trailerName, r.where, r.place, ...r.orders].some((x) => (x ?? "").toLowerCase().includes(q)));
}

export type LiveCounts = { enRoute: number; onSite: number; delayed: number };
export function liveChipCounts(rows: LiveRow[]): LiveCounts {
  return {
    enRoute: rows.filter((r) => r.kind === "to_rack" || r.kind === "to_drop").length,
    onSite: rows.filter((r) => r.kind === "loading" || r.kind === "unloading").length,
    delayed: rows.filter((r) => r.delayed).length,
  };
}
