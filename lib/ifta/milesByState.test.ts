import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeStateOf, milesByState, scaleToOdometer } from "./milesByState.ts";

const topology = JSON.parse(readFileSync(new URL("../../node_modules/us-atlas/states-10m.json", import.meta.url), "utf8"));
const stateOf = makeStateOf(topology);

test("stateOf: real places land in the right state; the ocean and Canada don't", () => {
  assert.equal(stateOf(27.95, -82.46), "FL"); // Tampa
  assert.equal(stateOf(33.75, -84.39), "GA"); // Atlanta
  assert.equal(stateOf(29.76, -95.37), "TX"); // Houston
  assert.equal(stateOf(41.88, -87.63), "IL"); // Chicago
  assert.equal(stateOf(25.0, -90.0), null);   // Gulf of Mexico
  assert.equal(stateOf(45.5, -73.6), null);   // Montreal
});

test("milesByState: a trip Tampa to Atlanta splits between FL and GA and sums to the distance", () => {
  const n = 60, t0 = Date.parse("2026-10-01T10:00:00Z");
  const pts = Array.from({ length: n + 1 }, (_, i) => ({ lat: 27.95 + (33.75 - 27.95) * (i / n), lon: -82.46 + (-84.39 + 82.46) * (i / n), at: new Date(t0 + i * 5 * 60000).toISOString() }));
  const r = milesByState(pts, stateOf);
  assert.ok(r.FL > 150 && r.GA > 80, JSON.stringify(r));
  const total = Object.values(r).reduce((s, x) => s + x, 0);
  assert.ok(total > 390 && total < 420, String(total));
});

test("milesByState: a GPS jump is dropped, points outside the states count as OUT", () => {
  const r = milesByState([
    { lat: 27.95, lon: -82.46, at: "2026-10-01T10:00:00Z" },
    { lat: 40.0, lon: -100.0, at: "2026-10-01T10:01:00Z" }, // 1000 mi in a minute
    { lat: 25.0, lon: -90.0, at: "2026-10-01T11:00:00Z" },
    { lat: 25.1, lon: -90.0, at: "2026-10-01T11:10:00Z" },
  ], stateOf);
  assert.equal(r.FL, undefined);
  assert.ok(r.OUT > 6);
});

test("scaleToOdometer: scales within 25%, otherwise keeps the GPS figures", () => {
  const s = scaleToOdometer({ FL: 100, GA: 100 }, 220);
  assert.ok(Math.abs(s.FL - 110) < 1e-9 && Math.abs(s.GA - 110) < 1e-9);
  assert.deepEqual(scaleToOdometer({ FL: 100 }, 500), { FL: 100 });
  assert.deepEqual(scaleToOdometer({ FL: 100 }, null), { FL: 100 });
});
