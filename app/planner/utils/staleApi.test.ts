import test from "node:test";
import assert from "node:assert/strict";
import { isStaleReading, pickSafest, pickSafe, pickIgnore } from "./staleApi.ts";

const NOW = Date.UTC(2026, 9, 24, 12);
const ago = (d: number) => new Date(NOW - d * 86400000).toISOString();

test("never loaded here is not stale", () => {
  assert.equal(isStaleReading({ last_api: null, last_api_updated_at: null }, 7, NOW), false);
  assert.equal(isStaleReading(undefined, 7, NOW), false);
});
test("a reading with no timestamp is stale (unknown age)", () => {
  assert.equal(isStaleReading({ last_api: 38, last_api_updated_at: null }, 7, NOW), true);
});
test("stale only past the limit", () => {
  assert.equal(isStaleReading({ last_api: 38, last_api_updated_at: ago(6) }, 7, NOW), false);
  assert.equal(isStaleReading({ last_api: 38, last_api_updated_at: ago(8) }, 7, NOW), true);
});
test("safest is product min, falling back to api_60", () => {
  assert.equal(pickSafest({ api_min: 33, api_60: 36 }), 33);
  assert.equal(pickSafest({ api_min: null, api_60: 36 }), 36);
  assert.equal(pickSafest({}), null);
});
test("safe is the heaviest this terminal has seen, not clamped to product min", () => {
  assert.equal(pickSafe({ api_min: 33, min_api_observed: 40, last_api: 42 }), 40);
  assert.equal(pickSafe({ api_min: 33, min_api_observed: null, last_api: 42 }), 42);
  assert.equal(pickSafe({ api_min: 33, api_60: 36 }), 33);
});
test("ignore pins the last reading, back-corrected; needs alpha", () => {
  const f = (api: number, t: number, a: number) => api - (t - 60) * a * 100;
  assert.equal(pickIgnore({ last_api: 40, last_temp_f: 60, alpha_per_f: 0.0004 }, f), 40);
  assert.equal(pickIgnore({ last_api: 40, last_temp_f: null, alpha_per_f: 0.0004 }, f), 40);
  assert.equal(pickIgnore({ last_api: 40, alpha_per_f: null }, f), null);
  assert.equal(pickIgnore({ last_api: null, alpha_per_f: 0.0004 }, f), null);
});
