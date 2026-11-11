import test from "node:test";
import assert from "node:assert/strict";
import { attachPendingDelays, endRunningDelay, loggedDelays, readPendingDelays, writeRunningDelay } from "./delays.ts";

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
(globalThis as any).window = { dispatchEvent: () => true };
(globalThis as any).Event = class {};

const mkStore = () => { const rows: any[] = []; return { rows, put: (_t: string, r: any) => void rows.push(r) }; };
const running = (startedAt: string) => ({ tripId: "", leg: "pre_trip" as const, code: "dispatch_wait", note: null, startedAt, pickupId: null, deliveryId: null });

test("a delay before any trip is kept, not written, until a trip starts", () => {
  mem.clear();
  const store = mkStore();
  writeRunningDelay("u", running("2026-11-10T20:00:00.000Z"));
  assert.equal(endRunningDelay(store, "u", "2026-11-10T20:20:00.000Z"), true);
  assert.equal(store.rows.length, 0);
  assert.equal(readPendingDelays("u").length, 1);
  assert.equal(attachPendingDelays(store, "u", "t1"), 1);
  const [d] = loggedDelays(store.rows);
  assert.equal(d.leg, "pre_trip");
  assert.equal(d.minutes, 20);
  assert.equal(store.rows[0].trip_id, "t1");
  assert.equal(readPendingDelays("u").length, 0);
});

test("a delay still running when the trip starts is ended and attached", () => {
  mem.clear();
  const store = mkStore();
  writeRunningDelay("u", running(new Date(Date.now() - 5 * 60000).toISOString()));
  assert.equal(attachPendingDelays(store, "u", "t2"), 1);
  assert.equal(store.rows[0].trip_id, "t2");
});
