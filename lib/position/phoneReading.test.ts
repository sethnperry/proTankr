import test from "node:test";
import assert from "node:assert/strict";
import { speedMph, toReading, type Fix } from "./phoneReading.ts";

const fix = (o: Partial<Fix>): Fix => ({ lat: 27.95, lon: -82.45, atMs: 1_000_000, speedMps: null, accuracyM: 10, ...o });

test("the phone's own speed is used (m/s to mph)", () => {
  assert.ok(Math.abs(speedMph(null, fix({ speedMps: 10 }))! - 22.37) < 0.01);
});
test("no speed from the phone: worked out from two fixes", () => {
  const a = fix({ atMs: 0 }), b = fix({ atMs: 60_000, lat: 27.95 + 1 / 69 / 2 }); // half a mile in a minute = 30 mph
  assert.ok(Math.abs(speedMph(a, b)! - 30) < 1);
});
test("no speed and no usable earlier fix: unknown", () => {
  assert.equal(speedMph(null, fix({})), null);
  assert.equal(speedMph(fix({ atMs: 0 }), fix({ atMs: 2_000 })), null);
  assert.equal(speedMph(fix({ atMs: 0 }), fix({ atMs: 10 * 60_000 })), null);
});
test("a vague fix is dropped", () => {
  assert.equal(toReading(null, fix({ accuracyM: 900 })), null);
  assert.equal(toReading(null, fix({ accuracyM: 20 }))?.lat, 27.95);
});
