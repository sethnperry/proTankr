import { test } from "node:test";
import assert from "node:assert/strict";
import { cityKey } from "./locationSwitchProgress.ts";

test("case and whitespace don't count as a different city", () => {
  assert.equal(cityKey("FL", "Tampa"), cityKey("fl", " tampa "));
});

test("a genuinely different city produces a different key", () => {
  assert.notEqual(cityKey("FL", "Tampa"), cityKey("FL", "Fort Lauderdale"));
});

test("same city name in a different state produces a different key", () => {
  assert.notEqual(cityKey("FL", "Springfield"), cityKey("IL", "Springfield"));
});

test("null/undefined state or city normalize to empty, not throw", () => {
  assert.equal(cityKey(null, "Tampa"), cityKey(undefined, "Tampa"));
  assert.equal(cityKey("FL", null), cityKey("FL", undefined));
});
