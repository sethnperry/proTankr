import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNearby } from "./nearbyMath.ts";

test("only stores in range show, deduped, nearest first", () => {
  const here = { lat: 26.64, lon: -81.87 };
  const rows = [
    { store_name: "Love's", store_number: "495", city: "Ft. Myers", state: "FL", lat: 26.645, lon: -81.87 },
    { store_name: "love's", store_number: "495", city: "Ft. Myers", state: "FL", lat: 26.641, lon: -81.87 },
    { store_name: "Pilot", store_number: "88", city: "Ft. Myers", state: "FL", lat: 26.65, lon: -81.875 },
    { store_name: "TA", store_number: null, city: "Ocala", state: "FL", lat: 29.18, lon: -82.14 },
    { store_name: "No pos", store_number: null, city: null, state: null, lat: null, lon: null },
  ];
  const out = pickNearby(rows, here);
  assert.deepEqual(out.map((s) => s.store_name), ["love's", "Pilot"]);
  assert.ok(out[0].miles < 0.1);
});
