// lib/trips/truckChange.ts
//
// A loaded trailer moving to a different truck mid-trip. The trip stays the
// same (the load belongs to the trailer); the change is a `truck_change`
// trip event plus trips.truck_id moving to the new truck. The gross weight is
// recomputed as the new truck's tare plus the product still on board.
//
// Pure: runs under node's test runner.

import { computeActualLbsForLine } from "../../app/planner/utils/planMath.ts";
import type { TripStoreLike } from "./tripLogic.ts";
import type { TripCompartmentLoadRow, TripEventRow, TripRow } from "./types.ts";

export const TRUCK_CHANGE_EVENT = "truck_change";

const num = (x: unknown): number | null => {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

// Product weight still on the trailer: each loaded compartment's gross
// gallons at its logged API and temp. `missing` counts compartments that
// couldn't be weighed (no gallons, API, temp, or product expansion).
export function productLbsOnBoard(
  compLoads: TripCompartmentLoadRow[],
  alphaByProduct: (productId: string | null) => number | null,
): { lbs: number; gallons: number; missing: number } {
  let lbs = 0, gallons = 0, missing = 0;
  for (const c of compLoads) {
    if (c.disposition !== "loaded") continue;
    const g = num(c.gross_gallons), api = num(c.api), t = num(c.temp_f), a = alphaByProduct(c.product_id);
    if (g == null || g <= 0) continue;
    gallons += g;
    if (api == null || t == null || a == null) { missing++; continue; }
    lbs += computeActualLbsForLine(g, api, t, a);
  }
  return { lbs, gallons, missing };
}

export function grossWithTare(tareLbs: number | null | undefined, productLbs: number): number | null {
  const tare = num(tareLbs);
  return tare == null ? null : Math.round(tare + productLbs);
}

// The trip's truck no longer matches the driver's truck, the trailer is the
// same, and product is on board.
export function needsTruckChange(
  trip: Pick<TripRow, "truck_id" | "trailer_id"> | null,
  currentTruckId: string | null,
  currentTrailerId: string | null,
  hasLoadOnBoard: boolean,
): boolean {
  if (!trip || !hasLoadOnBoard || !currentTruckId || !trip.truck_id) return false;
  if (currentTruckId === trip.truck_id) return false;
  if (trip.trailer_id && currentTrailerId !== trip.trailer_id) return false;
  return true;
}

export type TruckChangePayload = {
  from_truck_id: string | null;
  to_truck_id: string;
  from_truck_name: string | null;
  to_truck_name: string | null;
  trailer_id: string | null;
  from_odometer: number | null; // old truck's miles at the swap
  to_odometer: number | null;   // new truck's miles at the swap
  from_tare_lbs: number | null;
  to_tare_lbs: number | null;
  product_lbs: number | null;
  gross_before_lbs: number | null;
  gross_after_lbs: number | null;
};

export function recordTruckChange(
  store: TripStoreLike,
  args: { trip: TripRow; actorId: string; now: Date; newId: () => string; payload: TruckChangePayload },
): void {
  const at = args.now.toISOString();
  store.put("trip_events", {
    event_id: args.newId(),
    trip_id: args.trip.trip_id,
    event_type: TRUCK_CHANGE_EVENT,
    occurred_at: at,
    actor_id: args.actorId,
    pickup_id: null,
    delivery_id: null,
    payload: args.payload as unknown as Record<string, unknown>,
  });
  store.put("trips", { trip_id: args.trip.trip_id, truck_id: args.payload.to_truck_id });
}

export type TruckChange = {
  at: string;
  fromName: string | null;
  toName: string | null;
  fromOdometer: number | null;
  toOdometer: number | null;
  grossAfter: number | null;
};

export function truckChanges(events: TripEventRow[]): TruckChange[] {
  return events
    .filter((e) => e.event_type === TRUCK_CHANGE_EVENT)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
    .map((e) => {
      const p = (e.payload ?? {}) as Partial<TruckChangePayload>;
      return {
        at: e.occurred_at,
        fromName: p.from_truck_name ?? null,
        toName: p.to_truck_name ?? null,
        fromOdometer: num(p.from_odometer),
        toOdometer: num(p.to_odometer),
        grossAfter: num(p.gross_after_lbs),
      };
    });
}

// Miles across one or more trucks: each truck's own leg, summed. Null when a
// swap is missing either odometer (the legs can't be joined).
export function tripMiles(begin: number | null, end: number | null, changes: TruckChange[]): number | null {
  if (begin == null || end == null) return null;
  let total = 0, start = begin;
  for (const c of changes) {
    if (c.fromOdometer == null || c.toOdometer == null) return null;
    total += c.fromOdometer - start;
    start = c.toOdometer;
  }
  total += end - start;
  return Math.round(total * 10) / 10;
}
