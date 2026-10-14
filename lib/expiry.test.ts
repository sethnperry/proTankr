import { test } from "node:test";
import assert from "node:assert/strict";
import { expiryStateForDays, expiryStateFor, daysUntilIso } from "./expiry.ts";

test("thresholds: >30 valid, 8-30 soon, 0-7 expiring, past expired", () => {
  assert.equal(expiryStateForDays(31), "valid");
  assert.equal(expiryStateForDays(30), "soon");
  assert.equal(expiryStateForDays(8), "soon");
  assert.equal(expiryStateForDays(7), "expiring");
  assert.equal(expiryStateForDays(0), "expiring");
  assert.equal(expiryStateForDays(-1), "expired");
  assert.equal(expiryStateForDays(-200), "expired");
  assert.equal(expiryStateForDays(null), "not_set");
});

test("terminal access times out 30 days after it expires", () => {
  assert.equal(expiryStateForDays(-30, { access: true }), "expired");
  assert.equal(expiryStateForDays(-31, { access: true }), "inactive");
});

test("dates", () => {
  assert.equal(daysUntilIso("2026-11-13", "2026-10-14"), 30);
  assert.equal(expiryStateFor("2026-10-13", { todayIso: "2026-10-14" }), "expired");
  assert.equal(daysUntilIso(null), null);
});
