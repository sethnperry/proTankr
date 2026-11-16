import test from "node:test";
import assert from "node:assert/strict";
import { heldWarning } from "./adminNoticeLogic.ts";

test("warning names the unit, the driver and the trip", () => {
  const w = heldWarning([{ kind: "truck", id: "t", name: "25512", info: { holderId: "u", holderName: "Kyle Tatro", openTrip: true } }], "The status changes now.");
  assert.match(w, /Truck 25512 is being used by Kyle Tatro on a trip in progress/);
  assert.match(w, /Squawk/);
});
test("a held unit with no trip, and a driver with no name", () => {
  const w = heldWarning([{ kind: "trailer", id: "r", name: "3151", info: { holderId: "u", holderName: null, openTrip: false } }], "x");
  assert.match(w, /Trailer 3151 is being used by a driver\./);
});
