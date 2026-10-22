import test from "node:test";
import assert from "node:assert/strict";
import { decide, forVehicle, isQuotaError, FRESH_MS, BLOCK_MS } from "./shipmentCache.ts";

const now = Date.parse("2026-10-22T12:00:00Z");
const rec = (agoMs: number, blockedForMs?: number) => ({ fetched_at: new Date(now - agoMs).toISOString(), blocked_until: blockedForMs ? new Date(now + blockedForMs).toISOString() : null, rows: [] });

test("no cache -> fetch; fresh -> reuse; stale -> fetch", () => {
  assert.equal(decide(null, now), "fetch");
  assert.equal(decide(rec(5_000), now), "use_cache");
  assert.equal(decide(rec(FRESH_MS + 1), now), "fetch");
});

test("a quota pause wins over everything until it ends", () => {
  assert.equal(decide(rec(120_000, 30_000), now), "blocked");
  assert.equal(decide(rec(120_000, -1), now), "fetch");
  assert.ok(BLOCK_MS >= 60_000);
});

test("quota errors are recognised", () => {
  assert.ok(isQuotaError(new Error("API calls quota exceeded. Maximum admitted 10 per 1m.")));
  assert.ok(!isQuotaError(new Error("Incorrect login")));
});

test("one truck's shipments, newest first, since a time", () => {
  const rows = [
    { vehicleId: "b1", documentNumber: "A", start: "2026-10-22T10:00:00Z", shipperName: null, commodity: null },
    { vehicleId: "b2", documentNumber: "B", start: "2026-10-22T11:00:00Z", shipperName: null, commodity: null },
    { vehicleId: "b1", documentNumber: "C", start: "2026-10-22T11:30:00Z", shipperName: null, commodity: null },
    { vehicleId: "b1", documentNumber: "OLD", start: "2026-10-21T01:00:00Z", shipperName: null, commodity: null },
  ];
  assert.deepEqual(forVehicle(rows, "b1", Date.parse("2026-10-22T00:00:00Z")).map((r) => r.documentNumber), ["C", "A"]);
});
