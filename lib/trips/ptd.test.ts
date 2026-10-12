// lib/trips/ptd.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPtd } from "./ptd.ts";
import type { TripCompartmentLoadRow, TripRow } from "./types.ts";

const trip: TripRow = {
  trip_id: "aaaaaaaa-0000-0000-0000-000000000000", company_id: "co", truck_id: null, trailer_id: null,
  driver_id: "u1", created_by: "u1", status: "complete", shipper: "Ship", customer: "Cust",
  begin_miles: 1000, end_miles: 1123.4, entered_late: false, notes: null,
  started_at: "2026-10-10T10:00:00Z", completed_at: "2026-10-10T15:00:00Z",
};
const cl = (o: Partial<TripCompartmentLoadRow>): TripCompartmentLoadRow => ({
  compartment_load_id: String(o.comp_number), trip_id: trip.trip_id, pickup_id: "p1", order_id: null,
  delivery_id: "d1", comp_number: 1, product_id: "diesel", supplier: "Sup", bol_number: "B1",
  gross_gallons: 1000, net_gallons: 990, net_calculated_gallons: 990, temp_f: 80, api: 35,
  tank_number: "1", disposition: "delivered", winterized: null, additive_amount: null, bio_blend: null,
  loading_driver_id: "u1", ...o,
});

test("billing rolls up net per product per order; retained excluded; flags only validated", () => {
  const ptd = buildPtd(
    {
      trip,
      orders: [
        { order_id: "o1", trip_id: trip.trip_id, order_number: "100", shipper: null, customer: null, is_primary: true },
        { order_id: "o2", trip_id: trip.trip_id, order_number: "200", shipper: null, customer: null, is_primary: false },
      ],
      pickups: [{ pickup_id: "p1", trip_id: trip.trip_id, seq: 1, pickup_type: "terminal", terminal_id: null, rack_id: null,
        name: "Rack", city: "Tampa", state: "FL", odometer: null, arrived_at: "2026-10-10T10:00:00Z",
        begin_at: "2026-10-10T10:45:00Z", left_at: "2026-10-10T11:00:00Z", delay_reason_id: "r1", delay_note: null, load_id: null }],
      deliveries: [{ delivery_id: "d1", trip_id: trip.trip_id, seq: 1, location_id: null, one_off_name: "Store",
        one_off_address: null, delivery_type: "pump_off", status: "complete", arrived_at: null, begin_at: null, left_at: null,
        delay_reason_id: null, delay_note: null, delivering_driver_id: "u1", driver_signed_at: null, consignee_name: null, consignee_signature: null }],
      compLoads: [
        cl({ comp_number: 1, order_id: null }),
        cl({ comp_number: 2, order_id: null, net_gallons: 1000 }),
        cl({ comp_number: 3, order_id: "o2", product_id: "gas" }),
        cl({ comp_number: 4, disposition: "retained" }),
        cl({ comp_number: 5, disposition: "cancelled" }),
      ],
      tanks: [], events: [],
    },
    {
      product: (id) => (id === "gas" ? "Gas" : "Diesel"),
      delivery: (d) => d.one_off_name ?? "",
      driver: () => "Seth",
      delayReason: (id) => (id ? "Line at rack" : null),
      validated: new Set(["diesel"]),
    },
  );
  assert.equal(ptd.code, "PT-AAAAAAAA");
  assert.deepEqual(ptd.orderNumbers, ["100", "200"]);
  assert.equal(ptd.totalMiles, 123.4);
  assert.deepEqual(ptd.billing, [
    { order: "100", product: "Diesel", net: 1990 },
    { order: "200", product: "Gas", net: 990 },
  ]);
  assert.equal(ptd.compartments.length, 4);
  assert.equal(ptd.compartments[1].flag, "net edited from calculated (990 → 1,000)");
  assert.equal(ptd.pickups[0].delayMinutes, 45);
  assert.equal(ptd.pickups[0].delayReason, "Line at rack");
  assert.equal(ptd.deliveries[0].timeLabel, "Pump Time");
});

test("rack hop: the no-load rack shows its reason and counts toward the loading time", () => {
  const base = { trip_id: trip.trip_id, pickup_type: "terminal" as const, terminal_id: null, rack_id: null, city: "Tampa", state: "FL",
    odometer: null, delay_reason_id: null, delay_note: null, load_id: null };
  const ptd = buildPtd(
    {
      trip: { ...trip, started_at: "2026-10-10T09:30:00Z" },
      orders: [],
      pickups: [
        { ...base, pickup_id: "p0", seq: 1, name: "Marathon", arrived_at: "2026-10-10T09:50:00Z", begin_at: null,
          left_at: "2026-10-10T10:20:00Z", outcome: "no_load", no_load_reason: "long_line", no_load_note: null },
        { ...base, pickup_id: "p1", seq: 2, name: "Citgo", arrived_at: "2026-10-10T10:35:00Z", begin_at: "2026-10-10T10:45:00Z",
          left_at: "2026-10-10T11:00:00Z", outcome: "loaded", delay_code: "terminal_issue" },
      ],
      deliveries: [], compLoads: [cl({ comp_number: 1 })], tanks: [], events: [],
    },
    { product: () => "Diesel", delivery: () => "", driver: () => "Seth", delayReason: () => null },
  );
  assert.equal(ptd.pickups.length, 2);
  assert.equal(ptd.pickups[0].noLoad, true);
  assert.equal(ptd.pickups[0].noLoadReason, "Long Line");
  assert.equal(ptd.pickups[1].delayReason, "Terminal Issue");
  assert.equal(ptd.time.travelToRack, 20);
  assert.equal(ptd.time.loadingSpan, 70);
  assert.equal(ptd.time.racksTried, 2);
});
