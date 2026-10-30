import test from "node:test";
import assert from "node:assert/strict";
import { gaugingFromTimes, needsGaugingAnswer } from "./gaugingAsk.ts";

test("same-day window", () => assert.deepEqual(gaugingFromTimes("12:00", "12:45"), { cutoff: "12:00", minutes: 45 }));
test("window past midnight", () => assert.deepEqual(gaugingFromTimes("23:30", "00:15"), { cutoff: "23:30", minutes: 45 }));
test("rejects blank, equal and over 12 hours", () => {
  assert.equal(gaugingFromTimes("", "01:00"), null);
  assert.equal(gaugingFromTimes("01:00", "01:00"), null);
  assert.equal(gaugingFromTimes("01:00", "15:00"), null);
});
test("asks only when the terminal has no gauging time", () => {
  assert.equal(needsGaugingAnswer({ gauging_cutoff: null }), true);
  assert.equal(needsGaugingAnswer({ gauging_cutoff: "23:30" }), false);
  assert.equal(needsGaugingAnswer(null), false);
});
