import { test } from "node:test";
import assert from "node:assert/strict";
import { burnedFromGauge, burnCreditLbs, correctedGrossLbs, GAUGE_STOPS, DIESEL_CREDIT_LBS_PER_GAL } from "./fuelBurn.ts";

test("credit uses the conservative (light) 6.8 lb/gal", () => {
  assert.equal(DIESEL_CREDIT_LBS_PER_GAL, 6.8);
  assert.equal(burnCreditLbs(55), 374);
});

test("real case: 80,551 minus 55 gal is still over legal", () => {
  const g = correctedGrossLbs(80551, 55);
  assert.equal(g, 80177);
  assert.ok(g > 80000);
});

test("gauge: full tank burned nothing, 3/4 of 150 gal burned 37.5", () => {
  assert.equal(burnedFromGauge(150, 1), 0);
  assert.equal(burnedFromGauge(150, 3 / 4), 37.5);
  assert.equal(burnedFromGauge(150, 0), 150);
});

test("gauge input is clamped and bad input gives no credit", () => {
  assert.equal(burnedFromGauge(0, 0.5), 0);
  assert.equal(burnedFromGauge(NaN, 0.5), 0);
  assert.equal(burnedFromGauge(100, 1.5), 0);
  assert.equal(burnedFromGauge(100, -1), 100);
  assert.equal(burnCreditLbs(-10), 0);
});

test("gauge stops run fullest to empty in eighths", () => {
  assert.equal(GAUGE_STOPS.length, 9);
  assert.equal(GAUGE_STOPS[0].fraction, 1);
  assert.equal(GAUGE_STOPS[8].fraction, 0);
});
