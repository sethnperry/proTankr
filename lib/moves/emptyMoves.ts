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

// ── Automatic empty moves ────────────────────────────────────────────────────────────────────────
// A move opens by itself when a trip ends (completed or cancelled) and the driver has nothing open; it closes when
// the next trip begins, when the truck stops at a known place, or when the shift ends. Odometers come from telematics;
// only when that fails does the driver get asked (odometerMissing).
import { nearbyPlaces, type DeliveryLocation, type LatLon } from "../trips/deliveryLocations.ts";
import type { TripRow } from "../trips/types.ts";

export const AUTO_WINDOW_MS = 6 * 3600_000;   // a trip that ended longer ago than this is not "just now"
export const ARRIVE_MILES = 0.3;               // within this of a saved place counts as being there
export const MIN_MOVE_MIN = 5;                 // too short to be a move: a stop in the yard
export const MAX_STILL_MPH = 2;

const endOf = (t: Pick<TripRow, "status" | "completed_at" | "cancelled_at">): string | null =>
  t.status === "cancelled" ? (t.cancelled_at ?? t.completed_at ?? null) : t.status === "complete" ? (t.completed_at ?? null) : null;

/** The trip whose end should open a move now: ended recently, nothing open, no move already begun since. */
export function autoStartCandidate(o: { trips: TripRow[]; moves: EmptyMoveRow[]; driverId: string; hasOpenTrip: boolean; nowMs: number; windowMs?: number }): { tripId: string; endedAt: string } | null {
  if (o.hasOpenTrip || openMove(o.moves, o.driverId)) return null;
  const ended = o.trips
    .filter((t) => t.driver_id === o.driverId && endOf(t))
    .map((t) => ({ tripId: t.trip_id, endedAt: endOf(t)! }))
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
  if (!ended) return null;
  const endMs = Date.parse(ended.endedAt);
  if (!Number.isFinite(endMs) || o.nowMs - endMs > (o.windowMs ?? AUTO_WINDOW_MS) || o.nowMs < endMs) return null;
  if (o.moves.some((m) => m.driver_id === o.driverId && Date.parse(m.started_at) >= endMs - 60_000)) return null;
  return ended;
}

export type MovePos = { lat: number | null; lon: number | null; speedMph?: number | null };
const hasPos = (p: MovePos | null | undefined): p is { lat: number; lon: number; speedMph?: number | null } => !!p && p.lat != null && p.lon != null;

/** The saved place the truck is at, if any. */
export function placeAt(locations: DeliveryLocation[], pos: MovePos | null | undefined): DeliveryLocation | null {
  if (!hasPos(pos)) return null;
  return nearbyPlaces(locations, { lat: pos.lat, lon: pos.lon } as LatLon, ARRIVE_MILES, 1)[0] ?? null;
}

export type EndReason = "trip_begun" | "arrived" | "shift_ended";
/** Why the open move should close now, or null to keep going. */
export function autoEndReason(o: { move: EmptyMoveRow; hasOpenTrip: boolean; shiftActive: boolean; pos: MovePos | null; locations: DeliveryLocation[]; nowMs: number }): { reason: EndReason; place: DeliveryLocation | null } | null {
  const place = placeAt(o.locations, o.pos);
  if (o.hasOpenTrip) return { reason: "trip_begun", place };
  if (!o.shiftActive && moveMinutes(o.move, o.nowMs) >= 1) return { reason: "shift_ended", place };
  const still = o.pos?.speedMph == null || o.pos.speedMph <= MAX_STILL_MPH;
  if (place && still && moveMinutes(o.move, o.nowMs) >= MIN_MOVE_MIN && place.location_id !== o.move.from_place_id) return { reason: "arrived", place };
  return null;
}

/** Which odometer the driver still has to type, if any. */
export function odometerMissing(m: Pick<EmptyMoveRow, "begin_miles" | "end_miles" | "ended_at">): "begin" | "end" | null {
  if (m.begin_miles == null) return "begin";
  if (m.ended_at && m.end_miles == null) return "end";
  return null;
}
