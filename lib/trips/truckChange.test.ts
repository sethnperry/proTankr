import { test } from "node:test";
import assert from "node:assert/strict";
import { grossWithTare, needsTruckChange, productLbsOnBoard, recordTruckChange, tripMiles, truckChanges, TRUCK_CHANGE_EVENT } from "./truckChange.ts";
import type { TripCompartmentLoadRow, TripEventRow, TripRow } from "./types.ts";

const comp = (o: Partial<TripCompartmentLoadRow>): TripCompartmentLoadRow => ({
  compartment_load_id: "c", trip_id: "t", pickup_id: "p", order_id: null, delivery_id: null, comp_number: 1,
  product_id: "d2", supplier: null, bol_number: null, gross_gallons: 1000, net_gallons: null, net_calculated_gallons: null,
  temp_f: 60, api: 35, tank_number: null, disposition: "loaded", winterized: null, additive_amount: null,
  bio_blend: null, loading_driver_id: null, ...o,
});

test("product on board counts only loaded compartments", () => {
  const r = productLbsOnBoard([comp({}), comp({ disposition: "delivered" }), comp({ api: null })], () => 0.0004);
  assert.equal(r.missing, 1);
  assert.equal(r.gallons, 2000);
  assert.ok(r.lbs > 7000 && r.lbs < 7600, `diesel ~7.1 lb/gal, got ${r.lbs}`);
});

test("gross is tare plus product, null without tare", () => {
  assert.equal(grossWithTare(30000, 49500.4), 79500);
  assert.equal(grossWithTare(null, 49500), null);
});

test("truck change needs a different truck, same trailer, product on board", () => {
  const trip = { truck_id: "A", trailer_id: "R" };
  assert.equal(needsTruckChange(trip, "B", "R", true), true);
  assert.equal(needsTruckChange(trip, "A", "R", true), false);
  assert.equal(needsTruckChange(trip, "B", "R2", true), false, "different trailer is a drop, not a swap");
  assert.equal(needsTruckChange(trip, "B", "R", false), false);
  assert.equal(needsTruckChange(null, "B", "R", true), false);
});

test("recording moves the trip to the new truck and logs the event", () => {
  const rows: any[] = [];
  const store = { put: (t: string, r: any) => rows.push([t, r]), list: () => [] } as any;
  recordTruckChange(store, {
    trip: { trip_id: "t" } as TripRow, actorId: "u", now: new Date("2026-10-12T10:00:00Z"), newId: () => "e1",
    payload: { from_truck_id: "A", to_truck_id: "B", from_truck_name: "1", to_truck_name: "2", trailer_id: "R",
      from_odometer: 100, to_odometer: 500, from_tare_lbs: 30000, to_tare_lbs: 31000, product_lbs: 49000,
      gross_before_lbs: 79000, gross_after_lbs: 80000 },
  });
  assert.equal(rows[0][0], "trip_events");
  assert.equal(rows[0][1].event_type, TRUCK_CHANGE_EVENT);
  assert.deepEqual(rows[1], ["trips", { trip_id: "t", truck_id: "B" }]);
});

test("miles join each truck's leg", () => {
  const ev = (p: any, at: string): TripEventRow => ({ event_id: at, trip_id: "t", event_type: TRUCK_CHANGE_EVENT, occurred_at: at, actor_id: "u", pickup_id: null, delivery_id: null, payload: p });
  const changes = truckChanges([ev({ from_odometer: "150", to_odometer: 9000, to_truck_name: "2" }, "2026-10-12T10:00:00Z")]);
  assert.equal(changes[0].toName, "2");
  assert.equal(tripMiles(100, 9040, changes), 90); // 50 + 40
  assert.equal(tripMiles(100, 160, []), 60);
  assert.equal(tripMiles(100, 9040, truckChanges([ev({ from_odometer: 150 }, "x")])), null);
});
