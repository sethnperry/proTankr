import { test } from "node:test";
import assert from "node:assert/strict";
import { breakChip } from "./breakChip.ts";

const H = 60;

test("fresh shift, driving: nothing to time yet", () => {
  assert.equal(breakChip({ driveLeftMin: 11 * H, breakLeftMin: 8 * H, restMin: null }), "idle");
});
test("41 minutes driven, then a stop: a break would reset the 8 hours but not finish the requirement, so no timer", () => {
  assert.equal(breakChip({ driveLeftMin: 11 * H - 41, breakLeftMin: 8 * H - 41, restMin: 10 }), "idle");
  assert.equal(breakChip({ driveLeftMin: 11 * H - 41, breakLeftMin: 8 * H - 41, restMin: 45 }), "idle");
});
test("three hours driven, then a stop: the timer runs", () => {
  assert.equal(breakChip({ driveLeftMin: 8 * H, breakLeftMin: 5 * H, restMin: 10 }), "timer");
});
test("the check shows once the 30 minutes are done and stays after driving starts again", () => {
  // Stopped 30 minutes at 4 hours driven: the logs reset the break clock to 8 hours, 7 hours of driving left.
  assert.equal(breakChip({ driveLeftMin: 7 * H, breakLeftMin: 8 * H, restMin: 31 }), "done");
  assert.equal(breakChip({ driveLeftMin: 6 * H + 50, breakLeftMin: 7 * H + 50, restMin: null }), "done");
});
test("long drive with no break yet: it is due, count when stopped", () => {
  assert.equal(breakChip({ driveLeftMin: 3 * H, breakLeftMin: 60, restMin: null }), "idle");
  assert.equal(breakChip({ driveLeftMin: 3 * H, breakLeftMin: 60, restMin: 12 }), "timer");
});
test("near the end of the 11 hours a break isn't needed at all", () => {
  assert.equal(breakChip({ driveLeftMin: 90, breakLeftMin: 5 * H, restMin: null }), "done");
});
test("without both clocks the old behavior holds", () => {
  assert.equal(breakChip({ driveLeftMin: null, breakLeftMin: null, restMin: 12 }), "timer");
  assert.equal(breakChip({ driveLeftMin: null, breakLeftMin: null, restMin: 30 }), "done");
  assert.equal(breakChip({ driveLeftMin: null, breakLeftMin: null, restMin: null }), "idle");
});
