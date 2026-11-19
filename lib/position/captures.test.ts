import { test } from "node:test";
import assert from "node:assert/strict";
import { QUEUE_MAX, isMissingTable, parseQueue, shouldCaptureWake, trimQueue, type Capture } from "./captures.ts";

const row = (i: number): Capture => ({ capture_id: `id${i}`, company_id: "c", user_id: "u", truck_id: "t", trailer_id: null, lat: 1, lon: 2, odometer: null, cause: "open", captured_at: "2026-11-26T00:00:00Z" });

test("a wake capture waits five minutes since the last one", () => {
  assert.equal(shouldCaptureWake(null, 1000), true);
  assert.equal(shouldCaptureWake(0, 4 * 60_000), false);
  assert.equal(shouldCaptureWake(0, 5 * 60_000), true);
});
test("the queue keeps the newest rows and ignores junk", () => {
  const q = Array.from({ length: QUEUE_MAX + 5 }, (_, i) => row(i));
  const t = trimQueue(q);
  assert.equal(t.length, QUEUE_MAX);
  assert.equal(t[0].capture_id, "id5");
  assert.deepEqual(parseQueue("not json"), []);
  assert.deepEqual(parseQueue(JSON.stringify([row(1), { capture_id: 3 }, { capture_id: "x", lat: "a", lon: 1 }])).map((c) => c.capture_id), ["id1"]);
});
test("a missing table is recognised", () => {
  assert.equal(isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.position_captures'" }), true);
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "23505", message: "duplicate" }), false);
  assert.equal(isMissingTable(null), false);
});
