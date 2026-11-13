import test from "node:test";
import assert from "node:assert/strict";
import { buildError, stuckWrites } from "./appErrors.ts";
import { emptyState } from "../trips/tripStore.ts";

test("an error row trims the message and caps the payload", () => {
  const r = buildError({ companyId: "c", kind: "send_failed", message: "  Resend\n error   500 " + "x".repeat(900), payload: { a: 1 } });
  assert.equal(r.message.length, 500);
  assert.ok(!r.message.includes("\n"));
  const big = buildError({ companyId: null, kind: "other", message: "m", payload: { blob: "y".repeat(9000) } });
  assert.equal((big.payload as { truncated?: boolean }).truncated, true);
  assert.equal(buildError({ companyId: null, kind: "other", message: "" }).message, "Unknown error");
});

test("nothing queued is nothing stuck", () => {
  assert.equal(stuckWrites(emptyState(), Date.now()).count, 0);
});

test("a write the server rejected, a worn-out retry and an old edit all count", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  const s = emptyState();
  (s.rows.trips as Record<string, unknown>)["t1"] = { trip_id: "t1", client_updated_at: "2026-11-02T11:00:00Z" };
  (s.rows.trips as Record<string, unknown>)["t2"] = { trip_id: "t2", client_updated_at: "2026-11-02T11:55:00Z" };
  (s.rows.shift_events as Record<string, unknown>)["e1"] = { event_id: "e1", occurred_at: "2026-11-02T11:58:00Z" };
  s.queue.push({ table: "trips", key: "t1", version: 1, attempts: 0, nextAttemptAt: 0, lastError: null });          // waited an hour
  s.queue.push({ table: "trips", key: "t2", version: 1, attempts: 4, nextAttemptAt: 0, lastError: "offline" });     // tried 4 times
  s.queue.push({ table: "shift_events", key: "e1", version: 1, attempts: 0, nextAttemptAt: 0, lastError: null });   // fresh, fine
  s.failed.push({ table: "trip_events", key: "x", error: "23503 missing parent", failedAt: Date.parse("2026-11-02T10:00:00Z") });
  const r = stuckWrites(s, now);
  assert.equal(r.count, 3);
  assert.equal(r.failed, 1);
  assert.deepEqual(r.tables, ["trip_events", "trips"]);
  assert.equal(r.oldestAt, "2026-11-02T10:00:00.000Z");
});

test("stuck summary names the suspect fields: a huge number and a blank id", () => {
  const rows = { trips: { t1: { begin_miles: 818_000_000, trip_id: "t1" } }, trip_pickups: { p1: { terminal_id: "", name: "x" } } };
  const state = {
    rows, queue: [],
    failed: [{ table: "trips", key: "t1", error: "numeric field overflow", failedAt: 1 }, { table: "trip_pickups", key: "p1", error: 'invalid input syntax for type uuid: ""', failedAt: 2 }],
  } as unknown as Parameters<typeof stuckWrites>[0];
  const s = stuckWrites(state, 10);
  assert.deepEqual(s.items[0].suspect, { begin_miles: 818_000_000 });
  assert.deepEqual(s.items[1].suspect, { terminal_id: "(empty)" });
});
