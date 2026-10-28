import { test } from "node:test";
import assert from "node:assert/strict";
import { outageAge, outageExpiresAtMs, outageIsActive, MANUAL_REPORT_CAP_MS } from "./dates.ts";

const TZ = "America/New_York";
test("allocation resets at local midnight", () => {
  const created = Date.parse("2026-10-28T02:30:00Z"); // 10:30 PM Oct 27 in New York
  const exp = outageExpiresAtMs("out_of_allocation", created, TZ);
  assert.equal(new Date(exp).toISOString(), "2026-10-28T04:00:00.000Z"); // midnight EDT
  assert.equal(outageIsActive("out_of_allocation", created, exp - 1, TZ), true);
  assert.equal(outageIsActive("out_of_allocation", created, exp + 1, TZ), false);
});
test("out of product stays until cleared, capped at 72 h", () => {
  const created = Date.parse("2026-10-27T12:00:00Z");
  assert.equal(outageIsActive("out_of_product", created, created + 70 * 3600_000, TZ), true);
  assert.equal(outageExpiresAtMs("long_line", created, TZ), created + MANUAL_REPORT_CAP_MS);
});
test("age reads minutes, hours, then days", () => {
  const t = 1_000_000_000_000;
  assert.equal(outageAge(t, t + 5 * 60000), "5m");
  assert.equal(outageAge(t, t + 3 * 3600000 + 1000), "3h");
  assert.equal(outageAge(t, t + 30 * 3600000), "1d 6h");
});
