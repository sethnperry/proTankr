// lib/dispatch/liveGroups.ts
//
// The Live Dispatch Dashboard's chips: where every load in progress is right now.
//   En route   heading to a rack (to load) or to a store (to deliver)
//   On site    at a rack (loading) or at a store (unloading)
//   Delayed    on site longer than the company's delay threshold
// Pure: takes the trips the board already has.

import type { FleetTrip } from "../trips/useFleetTrips.ts";
import { terminalIssueLabel } from "../trips/terminalIssues.ts";
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
  /** En route again after a stop that ran past its delay threshold. */
  recovered?: boolean;
  delayMin?: number | null; // how long that earlier stop took
  etaMs?: number | null;    // new arrival estimate for this leg
  reason?: string | null;   // what the driver said held them up, if they said
  heldAt?: string | null;   // for a recovered row: the stop that held it
  orders: string[];
};

/** What the ETA lookup is asked about: the leg an en-route load is on. */
export type EtaQuery = { kind: "to_rack" | "to_drop"; tripId: string; truckId: string | null; terminalId: string | null; locationId: string | null; fromIso: string | null };

/** A delay that has ended stays on the Delayed list this long after the truck leaves. */
export const RECOVERED_WINDOW_MIN = 6 * 60;

export const KIND_LABEL: Record<LiveKind, string> = {
  to_rack: "To load", to_drop: "To deliver", loading: "Loading", unloading: "Unloading",
};

const done = (s: string | null | undefined) => s === "complete" || s === "cancelled";
const minutesSince = (iso: string | null, now: number) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60000)) : null);
const reasonOf = (code?: string | null, note?: string | null) => [terminalIssueLabel(code), note?.trim() || null].filter(Boolean).join(" · ") || null;
const placeText = (p: { city?: string | null; state?: string | null } | null | undefined) => [p?.city, p?.state].filter(Boolean).join(", ") || null;

export function classifyLive(
  trips: FleetTrip[], locations: Map<string, Place>, now: number,
  threshold: { loading: number; delivery: number },
  etaFor?: (q: EtaQuery) => number | null,
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
      out.push({ ...base, kind: "loading", where: atRack.name ?? "Rack", place: placeText(atRack), sinceIso: atRack.arrived_at, minutes, delayed: (minutes ?? 0) >= threshold.loading, reason: reasonOf(atRack.delay_code, atRack.delay_note) });
      continue;
    }
    const atDrop = drops.find((d) => d.arrived_at && !d.left_at);
    if (atDrop) {
      const minutes = minutesSince(atDrop.arrived_at, now);
      const pl = deliveryPlace(atDrop, locations);
      out.push({ ...base, kind: "unloading", where: pl.name ?? "Delivery", place: placeText(pl), sinceIso: atDrop.arrived_at, minutes, delayed: (minutes ?? 0) >= threshold.delivery, reason: reasonOf(null, atDrop.delay_note) });
      continue;
    }
    // The stop just left: if it ran past its delay threshold, the delay has ended and the load is moving again.
    const lastLeft = [
      ...pickups.filter((p) => p.arrived_at && p.left_at).map((p) => ({ arr: p.arrived_at!, left: p.left_at!, limit: threshold.loading, name: p.name ?? "the rack", reason: reasonOf(p.delay_code, p.delay_note) })),
      ...ft.deliveries.filter((d) => d.arrived_at && d.left_at).map((d) => ({ arr: d.arrived_at!, left: d.left_at!, limit: threshold.delivery, name: deliveryPlace(d, locations).name ?? "the store", reason: reasonOf(null, d.delay_note) })),
    ].sort((a, b) => Date.parse(b.left) - Date.parse(a.left))[0];
    const dwell = lastLeft ? Math.round((Date.parse(lastLeft.left) - Date.parse(lastLeft.arr)) / 60000) : null;
    const recovered = !!lastLeft && dwell != null && dwell >= lastLeft.limit && now - Date.parse(lastLeft.left) <= RECOVERED_WINDOW_MIN * 60000;
    const moving = (kind: "to_rack" | "to_drop", terminalId: string | null, locationId: string | null, fromIso: string | null) => ({
      delayed: false,
      ...(recovered ? { recovered: true, delayMin: dwell, heldAt: lastLeft!.name, reason: lastLeft!.reason, etaMs: etaFor?.({ kind, tripId: ft.trip.trip_id, truckId: ft.trip.truck_id ?? null, terminalId, locationId, fromIso: lastLeft!.left }) ?? null } : {}),
    });
    const nextRack = pickups.find((p) => !p.arrived_at && !p.left_at);
    const loadedAboard = ft.compLoads.some((c) => c.disposition === "loaded");
    if (nextRack && !(loadedAboard && !pickups.some((p) => !p.arrived_at))) {
      // Heading to a rack: the leg began when the trip did, or when the last rack was left.
      const since = [...pickups].reverse().find((p) => p.left_at)?.left_at ?? ft.trip.started_at ?? null;
      out.push({ ...base, kind: "to_rack", where: nextRack.name ?? "Rack", place: placeText(nextRack), sinceIso: since, minutes: minutesSince(since, now), ...moving("to_rack", nextRack.terminal_id ? String(nextRack.terminal_id) : null, null, since) });
      continue;
    }
    const nextDrop = drops.find((d) => !d.arrived_at);
    if (nextDrop) {
      const pl = deliveryPlace(nextDrop, locations);
      const since = [...pickups].reverse().find((p) => p.left_at)?.left_at ?? ft.trip.started_at ?? null;
      out.push({ ...base, kind: "to_drop", where: pl.name ?? "Delivery", place: placeText(pl), sinceIso: since, minutes: minutesSince(since, now), ...moving("to_drop", null, nextDrop.location_id ?? null, since) });
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
    delayed: rows.filter((r) => r.delayed || r.recovered).length,
  };
}
