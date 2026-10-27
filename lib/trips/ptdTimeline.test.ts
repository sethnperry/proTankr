import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPtd } from "./ptd.ts";
import { buildTimeline } from "./ptdTimeline.ts";
import type { TripRow } from "./types.ts";

const trip: TripRow = {
  trip_id: "aaaaaaaa-0000-0000-0000-000000000000", company_id: "co", truck_id: null, trailer_id: null,
  driver_id: "u1", created_by: "u1", status: "complete", shipper: "Ship", customer: "Cust",
  begin_miles: 1000, end_miles: 1100, entered_late: false, notes: null,
  started_at: "2026-10-10T10:00:00Z", completed_at: "2026-10-10T15:00:00Z",
};

test("every timestamp lands on the timeline, in order", () => {
  const ptd = buildPtd({
    trip, orders: [], compLoads: [], tanks: [],
    pickups: [{ pickup_id: "p1", trip_id: trip.trip_id, seq: 1, pickup_type: "terminal", terminal_id: null, rack_id: null, name: "Rack", city: null, state: null,
      odometer: null, arrived_at: "2026-10-10T10:30:00Z", begin_at: "2026-10-10T10:50:00Z", left_at: "2026-10-10T11:30:00Z", delay_reason_id: null, delay_note: null, load_id: null }],
    deliveries: [{ delivery_id: "d1", trip_id: trip.trip_id, seq: 1, location_id: null, one_off_name: "Store", one_off_address: null, delivery_type: "drop", status: "complete",
      arrived_at: "2026-10-10T13:00:00Z", begin_at: "2026-10-10T13:10:00Z", left_at: "2026-10-10T13:50:00Z", delay_reason_id: null, delay_note: null,
      delivering_driver_id: "u1", driver_signed_at: "2026-10-10T13:45:00Z", consignee_name: null, consignee_signature: null }],
    events: [{ event_id: "e1", trip_id: trip.trip_id, event_type: "delay_logged", occurred_at: "2026-10-10T12:00:00Z", actor_id: "u1", pickup_id: null, delivery_id: null,
      payload: { leg: "to_drop", code: "traffic", label: "Traffic", note: null, minutes: 20, started_at: "2026-10-10T11:50:00Z", ended_at: "2026-10-10T12:10:00Z" } } as any],
  }, { product: () => "P", delivery: (d) => d.one_off_name ?? "", driver: () => "Seth", delayReason: () => null });
  const t = buildTimeline(ptd);
  const times = t.map((x) => Date.parse(x.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  const text = t.map((x) => x.text).join("|");
  for (const want of ["Trip begun", "Arrived at Rack", "Began loading", "Departed Rack", "Delay · Traffic", "Arrived at Store", "Began delivering", "Seth signed as delivering driver", "Departed Store", "Trip complete"]) {
    assert.ok(text.includes(want), want);
  }
});
