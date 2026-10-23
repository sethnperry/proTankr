import test from "node:test";
import assert from "node:assert/strict";
import { dropEstimate, dropOutcome, dropRules, DEFAULT_DROP_RULES } from "./dropSchedule.ts";

const T0 = "2026-10-23T12:00:00.000Z";
const at = (min: number) => new Date(Date.parse(T0) + min * 60000).toISOString();

test("estimate: arrival + prep, then gallons at the pump rate", () => {
  const e = dropEstimate(T0, 8100, DEFAULT_DROP_RULES);
  assert.equal(e.beginAt, at(15));
  assert.equal(e.dropMin, 18);
  assert.equal(e.expectedEndAt, at(33));
});

test("estimate rounds the drop up to a whole minute", () => {
  assert.equal(dropEstimate(T0, 451, DEFAULT_DROP_RULES).dropMin, 2);
});

test("outcome: early, on the estimate, inside the grace, over", () => {
  const e = at(33);
  assert.deepEqual(dropOutcome({ expectedEndAt: e, finishAt: at(28), graceMin: 10 }), { kind: "ahead", minutes: 5 });
  assert.deepEqual(dropOutcome({ expectedEndAt: e, finishAt: at(33), graceMin: 10 }), { kind: "ahead", minutes: 0 });
  assert.deepEqual(dropOutcome({ expectedEndAt: e, finishAt: at(40), graceMin: 10 }), { kind: "within_grace", minutes: 7 });
  assert.deepEqual(dropOutcome({ expectedEndAt: e, finishAt: at(60), graceMin: 10 }), { kind: "over", minutes: 17 });
});

test("a delay already recorded moves the expected end later", () => {
  // Expected 33, plus 20 logged = 53. Finishing at 60 is 7 late: inside the grace.
  assert.deepEqual(dropOutcome({ expectedEndAt: at(33), finishAt: at(60), recordedDelayMin: 20, graceMin: 10 }), { kind: "within_grace", minutes: 7 });
  assert.deepEqual(dropOutcome({ expectedEndAt: at(33), finishAt: at(70), recordedDelayMin: 20, graceMin: 10 }), { kind: "over", minutes: 7 });
});

test("rules fall back to the defaults for missing or silly values", () => {
  assert.deepEqual(dropRules({}), DEFAULT_DROP_RULES);
  assert.equal(dropRules({ pump_gal_per_min: 0 }).gallonsPerMin, 450);
  assert.equal(dropRules({ delivery_prep_minutes: 0 }).prepMin, 0);
});
