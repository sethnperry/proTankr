import test from "node:test";
import assert from "node:assert/strict";
import { buildDelayReport } from "./delayReport.ts";
import { DELAY_EVENT } from "./delays.ts";
import type { TripEventRow } from "./types.ts";

const ev = (trip: string, leg: string, code: string, minutes: number, at: string): TripEventRow => ({
  event_id: at + trip, trip_id: trip, event_type: DELAY_EVENT, occurred_at: at, actor_id: "u", pickup_id: null, delivery_id: null, payload: { leg, code, minutes },
});
const del = (id: string, trip: string, unaccounted: number | null) => ({ delivery_id: id, trip_id: trip, unaccounted_delay_min: unaccounted, arrived_at: "2026-10-23T12:00:00Z", left_at: "2026-10-23T13:00:00Z", status: "complete" as const, location_id: null, one_off_name: "Store" });

test("logged delay and unaccounted time add up per driver and overall", () => {
  const r = buildDelayReport({
    trips: [{ trip_id: "t1", driver_id: "A", started_at: null }, { trip_id: "t2", driver_id: "B", started_at: null }],
    deliveries: [del("d1", "t1", 25), del("d2", "t2", null), del("d3", "t2", 40), del("dx", "gone", 99)],
    events: [ev("t1", "at_drop", "blocked_access", 12, "2026-10-23T12:10:00Z"), ev("t1", "to_drop", "traffic", 30, "2026-10-23T10:00:00Z"), ev("t2", "at_drop", "traffic", 8, "2026-10-23T12:20:00Z"), ev("gone", "at_drop", "traffic", 500, "2026-10-23T12:20:00Z")],
  });
  assert.equal(r.loggedMin, 50);
  assert.equal(r.unaccountedMin, 65);
  assert.equal(r.delays, 3);
  assert.equal(r.byReason[0].label, "Traffic");
  assert.equal(r.byReason[0].minutes, 38);
  assert.equal(r.byDriver[0].driverId, "B"); // 40 unaccounted beats 25
  assert.equal(r.unaccounted[0].minutes, 40);
  const a = r.byDriver.find((d) => d.driverId === "A")!;
  assert.equal(a.byLeg.to_drop, 30);
  assert.equal(a.byLeg.at_drop, 12);
});

test("empty input gives an empty report", () => {
  const r = buildDelayReport({ trips: [], deliveries: [], events: [] });
  assert.equal(r.loggedMin, 0);
  assert.deepEqual(r.byDriver, []);
});
