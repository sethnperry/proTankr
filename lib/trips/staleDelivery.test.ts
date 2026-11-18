import test from "node:test";
import assert from "node:assert/strict";
import { isOpenDelivery, staleOpenDelivery } from "./staleDelivery.ts";

const now = Date.parse("2026-11-18T05:00:00Z");
const d = (arrived: string | null, left: string | null = null, status = "planned") => ({ arrived_at: arrived, left_at: left, status });

test("an arrived delivery that was never finished is open; a finished or not-yet-arrived one is not", () => {
  assert.equal(isOpenDelivery(d("2026-11-18T00:33:00Z")), true);
  assert.equal(isOpenDelivery(d("2026-11-18T00:33:00Z", "2026-11-18T01:00:00Z")), false);
  assert.equal(isOpenDelivery(d("2026-11-18T00:33:00Z", null, "complete")), false);
  assert.equal(isOpenDelivery(d(null)), false);
});

test("only a delivery open for hours counts as stale", () => {
  assert.ok(staleOpenDelivery([d("2026-11-18T00:33:00Z")], now));
  assert.equal(staleOpenDelivery([d("2026-11-18T04:30:00Z")], now), null);
  assert.equal(staleOpenDelivery([d("2026-11-18T00:33:00Z", "2026-11-18T01:00:00Z")], now), null);
});
