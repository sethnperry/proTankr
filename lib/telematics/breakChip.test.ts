import { test } from "node:test";
import assert from "node:assert/strict";
import { breakChip } from "./breakChip.ts";

const H = 60;

test("driving with a break still due: nothing to time", () => {
  assert.equal(breakChip({ driveLeftMin: 11 * H, breakLeftMin: 8 * H, restMin: null }), "idle");
  assert.equal(breakChip({ driveLeftMin: 3 * H, breakLeftMin: 60, restMin: null }), "idle");
});
test("every stop is timed, even after only 41 minutes of driving", () => {
  assert.equal(breakChip({ driveLeftMin: 11 * H - 41, breakLeftMin: 8 * H - 41, restMin: 10 }), "timer");
});
test("an early break: the check shows while stopped 30 minutes, and resets when driving starts", () => {
  // Stopped 31 minutes at 41 minutes driven: the break clock is back to 8 hours but 10 hours of driving are left.
  assert.equal(breakChip({ driveLeftMin: 11 * H - 41, breakLeftMin: 8 * H, restMin: 31 }), "rested");
  assert.equal(breakChip({ driveLeftMin: 11 * H - 41, breakLeftMin: 8 * H, restMin: null }), "idle");
});
test("a break after about three hours is permanent", () => {
  assert.equal(breakChip({ driveLeftMin: 8 * H, breakLeftMin: 8 * H, restMin: 31 }), "done");
  assert.equal(breakChip({ driveLeftMin: 7 * H, breakLeftMin: 8 * H, restMin: 31 }), "done");
  // ...and it stays after driving starts again, and for the rest of the shift.
  assert.equal(breakChip({ driveLeftMin: 6 * H + 50, breakLeftMin: 7 * H + 50, restMin: null }), "done");
  assert.equal(breakChip({ driveLeftMin: 2 * H, breakLeftMin: 3 * H, restMin: null }), "done");
});
test("just under three hours driven: not permanent", () => {
  assert.equal(breakChip({ driveLeftMin: 8 * H + 1, breakLeftMin: 8 * H, restMin: 31 }), "rested");
  assert.equal(breakChip({ driveLeftMin: 8 * H + 1, breakLeftMin: 8 * H, restMin: null }), "idle");
});
test("a break that isn't done yet is timed whichever side of three hours", () => {
  assert.equal(breakChip({ driveLeftMin: 7 * H, breakLeftMin: 5 * H, restMin: 12 }), "timer");
  assert.equal(breakChip({ driveLeftMin: 10 * H, breakLeftMin: 7 * H, restMin: 12 }), "timer");
});
test("near the end of the 11 hours a break isn't needed at all", () => {
  assert.equal(breakChip({ driveLeftMin: 90, breakLeftMin: 5 * H, restMin: null }), "done");
});
test("without both clocks: a 30-minute stop shows the check while stopped, shorter ones count up", () => {
  assert.equal(breakChip({ driveLeftMin: null, breakLeftMin: null, restMin: 12 }), "timer");
  assert.equal(breakChip({ driveLeftMin: null, breakLeftMin: null, restMin: 30 }), "rested");
  assert.equal(breakChip({ driveLeftMin: null, breakLeftMin: null, restMin: null }), "idle");
});

test("once a break after three hours is done, later stops are not timed", () => {
  // Break done at 4 hours driven (clock back to 8 hours, 7 left), then driving: the check stays.
  assert.equal(breakChip({ driveLeftMin: 6 * H, breakLeftMin: 6 * H, restMin: null }), "done");
  // A fuel stop or a wait afterwards, of any length, shows the check, not a count-up.
  assert.equal(breakChip({ driveLeftMin: 6 * H, breakLeftMin: 6 * H, restMin: 4 }), "done");
  assert.equal(breakChip({ driveLeftMin: 6 * H, breakLeftMin: 6 * H, restMin: 25 }), "done");
});
