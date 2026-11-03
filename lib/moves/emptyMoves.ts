// lib/moves/emptyMoves.ts
//
// Empty moves: the truck going somewhere with no load (bobtail between yards, an empty return, repositioning).
// One open move per driver. Pure: no Supabase, no React.

import type { EmptyMoveRow } from "../trips/types.ts";

export type MoveKind = EmptyMoveRow["kind"];
export const MOVE_KINDS: { id: MoveKind; label: string; hint: string }[] = [
  { id: "bobtail", label: "Bobtail", hint: "Truck alone, no trailer." },
  { id: "empty_return", label: "Empty return", hint: "Heading back with an empty trailer." },
  { id: "reposition", label: "Reposition", hint: "Moving to be ready for the next load." },
];
export const moveKindLabel = (k: string | null | undefined) => MOVE_KINDS.find((m) => m.id === k)?.label ?? "Empty move";

export const openMove = (moves: EmptyMoveRow[], driverId: string): EmptyMoveRow | null =>
  moves.filter((m) => m.driver_id === driverId && !m.ended_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;

/** Bobtail when no trailer is held, an empty return when a trailer is. */
export const suggestKind = (hasTrailer: boolean): MoveKind => (hasTrailer ? "empty_return" : "bobtail");

export const moveMiles = (m: Pick<EmptyMoveRow, "begin_miles" | "end_miles">): number | null =>
  m.begin_miles != null && m.end_miles != null && m.end_miles >= m.begin_miles ? Math.round((m.end_miles - m.begin_miles) * 10) / 10 : null;

export const moveMinutes = (m: Pick<EmptyMoveRow, "started_at" | "ended_at">, nowMs = Date.now()): number => {
  const a = Date.parse(m.started_at);
  const b = m.ended_at ? Date.parse(m.ended_at) : nowMs;
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 60_000) : 0;
};

export type MovePlace = { id: string | null; text: string | null };
export function newMove(o: {
  id: string; companyId: string; driverId: string; truckId: string | null; trailerId: string | null;
  kind: MoveKind; from: MovePlace; to: MovePlace; beginMiles: number | null; nowIso: string;
}): Omit<EmptyMoveRow, "updated_at" | "client_updated_at"> {
  return {
    move_id: o.id, company_id: o.companyId, driver_id: o.driverId, truck_id: o.truckId, trailer_id: o.trailerId, kind: o.kind,
    from_place_id: o.from.id, from_text: o.from.text?.trim() || null, to_place_id: o.to.id, to_text: o.to.text?.trim() || null,
    started_at: o.nowIso, ended_at: null, begin_miles: o.beginMiles, end_miles: null, billable: null, notes: null, source: "app",
  } as Omit<EmptyMoveRow, "updated_at" | "client_updated_at">;
}

/** Totals for a report: minutes and miles by kind, and how many moves have no billable call yet. */
export function summarizeMoves(moves: EmptyMoveRow[], nowMs = Date.now()) {
  const byKind = new Map<MoveKind, { count: number; minutes: number; miles: number }>();
  let unreviewed = 0, billableMin = 0;
  for (const m of moves) {
    const cur = byKind.get(m.kind) ?? { count: 0, minutes: 0, miles: 0 };
    const min = moveMinutes(m, nowMs);
    cur.count++; cur.minutes += min; cur.miles += moveMiles(m) ?? 0;
    byKind.set(m.kind, cur);
    if (m.billable == null) unreviewed++;
    else if (m.billable) billableMin += min;
  }
  return { byKind, unreviewed, billableMin, totalMinutes: [...byKind.values()].reduce((s, k) => s + k.minutes, 0) };
}

// ── Stamps: the odometer, time and place captured when the driver cancels a load or ends a shift ────────────────
// A cancel opens an empty move from the stamp; the next trip's begin (or the shift end) closes it. The odometer is
// always confirmed by the driver (prefilled from telematics when it answers), so the move never depends on a tracker.
import { nearbyPlaces, type DeliveryLocation, type LatLon } from "../trips/deliveryLocations.ts";

export const ARRIVE_MILES = 0.3; // within this of a saved place counts as being there

export type StampSource = "terminal" | "gps" | "geotab" | "none";
export type Stamp = { at: string; odometer: number; lat: number | null; lon: number | null; placeId: string | null; placeText: string | null; source: StampSource };

/** Why an odometer entry can't be accepted, or null. `floor` is the lowest it may be (the move's start). */
export function odometerProblem(raw: string, floor: number | null): string | null {
  const t = raw.replace(/,/g, "").trim();
  if (!t) return "Enter the odometer.";
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return "That isn't a valid odometer.";
  if (floor != null && n < floor) return `Lower than the last reading (${Math.round(floor).toLocaleString("en-US")}).`;
  return null;
}
export const parseOdometer = (raw: string): number | null => (odometerProblem(raw, null) ? null : Number(raw.replace(/,/g, "").trim()));

/** The saved place a position is at, else its city text. */
export function placeFor(locations: DeliveryLocation[], pos: { lat: number; lon: number } | null, city: string | null): { id: string | null; text: string | null } {
  if (pos) {
    const at = nearbyPlaces(locations, pos as LatLon, ARRIVE_MILES, 1)[0];
    if (at) return { id: at.location_id, text: null };
  }
  return { id: null, text: city?.trim() || null };
}

/** A new open move from a stamp (the load was cancelled here). */
export const moveFromStamp = (o: { id: string; companyId: string; driverId: string; truckId: string | null; trailerId: string | null; stamp: Stamp }) =>
  newMove({ id: o.id, companyId: o.companyId, driverId: o.driverId, truckId: o.truckId, trailerId: o.trailerId, kind: suggestKind(!!o.trailerId),
    from: { id: o.stamp.placeId, text: o.stamp.placeText }, to: { id: null, text: null }, beginMiles: o.stamp.odometer, nowIso: o.stamp.at });
