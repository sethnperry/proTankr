import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryDetailsFor, fmtAgo, fmtClock, isDieselLike, soldPerHour, DELIVERY_DETAILS_EVENT } from "./deliveryDetails.ts";
import type { TripEventRow } from "./types.ts";

const ev = (delivery_id: string, at: string, payload: Record<string, unknown>): TripEventRow => ({
  event_id: at, trip_id: "t", event_type: DELIVERY_DETAILS_EVENT, occurred_at: at, actor_id: "u", pickup_id: null, delivery_id, payload,
});

test("details: newest event for the delivery wins, fields cleaned", () => {
  const events = [
    ev("d1", "2026-10-19T10:00:00Z", { odometer: 100, issues: ["leak"] }),
    ev("d1", "2026-10-19T11:00:00Z", { odometer: "200", additives: ["biocide"], additive_note: "  ", issues: [] }),
    ev("d2", "2026-10-19T12:00:00Z", { odometer: 300 }),
  ];
  const d = deliveryDetailsFor(events, "d1")!;
  assert.equal(d.odometer, 200);
  assert.deepEqual(d.additives, ["biocide"]);
  assert.equal(d.additiveNote, null);
  assert.deepEqual(d.issues, []);
  assert.equal(deliveryDetailsFor(events, "zz"), null);
});

test("clock, ago and diesel check", () => {
  assert.equal(fmtClock(65_000), "1:05");
  assert.equal(fmtClock(3_725_000), "1:02:05");
  const now = Date.parse("2026-10-19T12:00:00Z");
  assert.equal(fmtAgo("2026-10-19T11:20:00Z", now), "40 min ago");
  assert.equal(fmtAgo("2026-10-19T05:48:00Z", now), "6.2 hrs ago");
  assert.equal(fmtAgo("2026-10-16T12:00:00Z", now), "3 days ago");
  assert.ok(isDieselLike("ULSD Diesel #2"));
  assert.ok(!isDieselLike("Regular Unleaded E10 87"));
});

test("sold per hour: after of last drop down to before of this one", () => {
  assert.equal(soldPerHour(8000, "2026-10-19T00:00:00Z", 6000, "2026-10-19T10:00:00Z"), 200);
  assert.equal(soldPerHour(8000, "2026-10-19T00:00:00Z", 9000, "2026-10-19T10:00:00Z"), null);
  assert.equal(soldPerHour(null, "2026-10-19T00:00:00Z", 6000, "2026-10-19T10:00:00Z"), null);
});
