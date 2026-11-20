import test from "node:test";
import assert from "node:assert/strict";
import { matchesTracker, trackerMiles } from "./odometerSync.ts";

test("matches while the field holds the tracker's reading", () => {
  assert.equal(matchesTracker("331435", 331435.4), true);
  assert.equal(matchesTracker(331435, 331435), true);
  assert.equal(matchesTracker("331,435", 331435), true);
});
test("a different number, an empty field or no reading is not a match", () => {
  assert.equal(matchesTracker("331436", 331435), false);
  assert.equal(matchesTracker("", 331435), false);
  assert.equal(matchesTracker("331435", null), false);
  assert.equal(matchesTracker("331435", 0), false);
  assert.equal(trackerMiles(undefined), null);
});
