import test from "node:test";
import assert from "node:assert/strict";
import { initialsOf, dotsFor, truckLine } from "./boardStatus.ts";

test("initials use first and last name", () => {
  assert.equal(initialsOf("Seth Perry"), "SP");
  assert.equal(initialsOf("  maria  de la cruz "), "MC");
  assert.equal(initialsOf("Madonna"), "M");
  assert.equal(initialsOf(null), "");
});

test("dots run comp 3 to comp 1 and skip empty compartments", () => {
  const d = dotsFor([{ comp: 1, productId: "a" }, { comp: 2, productId: null }, { comp: 3, productId: "b" }], (p) => (p === "a" ? "red" : "blue"));
  assert.deepEqual(d, [{ comp: 3, color: "blue" }, { comp: 1, color: "red" }]);
});

test("truck line: status wins, then in-use initials, else nothing", () => {
  assert.deepEqual(truckLine({ statusLabel: "Readyline", statusCode: "readyline", claimedBy: "u", initials: "SP" }), { text: "Readyline", tone: "status" });
  assert.deepEqual(truckLine({ statusLabel: "In Use", statusCode: "in_use", claimedBy: "u", initials: "SP" }), { text: "In Use · SP", tone: "use" });
  assert.deepEqual(truckLine({ statusLabel: null, statusCode: null, claimedBy: null, initials: "" }), { text: "", tone: "none" });
});
