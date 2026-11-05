import { test } from "node:test";
import assert from "node:assert/strict";
import { beginEquipmentVerdict as v } from "./beginEquipment.ts";

test("nothing held opens the picker, never pre-selects", () => {
  assert.equal(v({ hasCombo: false, hasTruck: false, hasTrailer: false, needTrailer: true }), "pick");
});
test("truck and trailer go straight on", () => {
  assert.equal(v({ hasCombo: true, hasTruck: true, hasTrailer: true, needTrailer: true }), "go");
});
test("a truck with no trailer cannot begin a trip: the empty move is offered", () => {
  assert.equal(v({ hasCombo: false, hasTruck: true, hasTrailer: false, needTrailer: true }), "bobtail");
});
test("a fuel stop only needs a truck", () => {
  assert.equal(v({ hasCombo: false, hasTruck: true, hasTrailer: false, needTrailer: false }), "go");
  assert.equal(v({ hasCombo: false, hasTruck: false, hasTrailer: false, needTrailer: false }), "pick");
});
