import test from "node:test";
import assert from "node:assert/strict";
import { trailerEventId, trailerRecords } from "./trailerEvents.ts";

test("trailerEventId: same event, same uuid-shaped id; different event, different id", async () => {
  const a = await trailerEventId("t1", "trailer_hook", "tr1", "2026-10-23T10:00:00.000Z");
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(a, await trailerEventId("t1", "trailer_hook", "tr1", "2026-10-23T10:00:00.000Z"));
  assert.notEqual(a, await trailerEventId("t1", "trailer_drop", "tr1", "2026-10-23T10:00:00.000Z"));
});

test("trailerRecords: hooks and drops in time order with the place", () => {
  const ev = (type: string, at: string, p: object) => ({ event_id: at, trip_id: "t", event_type: type, occurred_at: at, actor_id: null, pickup_id: null, delivery_id: null, payload: p }) as any;
  const r = trailerRecords([
    ev("trailer_drop", "2026-10-23T12:00:00Z", { trailer_name: "3151", city: "Tampa", state: "FL" }),
    ev("trailer_hook", "2026-10-23T09:00:00Z", { trailer_name: "3151" }),
    ev("pickup_arrived", "2026-10-23T10:00:00Z", {}),
  ]);
  assert.deepEqual(r.map((x) => [x.type, x.trailerName, x.place]), [["hook", "3151", null], ["drop", "3151", "Tampa, FL"]]);
});
