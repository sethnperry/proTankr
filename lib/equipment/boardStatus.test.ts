import test from "node:test";
import assert from "node:assert/strict";
import { initialsOf, dotsFor, truckLine, driverActivity, nextDeliveryIndex } from "./boardStatus.ts";

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

test("driverActivity reads the trip", () => {
  const base = { status: "in_transit", pickups: [], deliveries: [] as any[] };
  assert.equal(driverActivity(null, false), null);
  assert.equal(driverActivity(null, true), "Fueling");
  assert.equal(driverActivity(base, false), "En route");
  assert.equal(driverActivity({ ...base, pickups: [{ arrived_at: "x", left_at: null, outcome: null }] }, false), "Loading");
  assert.equal(driverActivity({ ...base, deliveries: [{ arrived_at: "x", left_at: null, status: "arrived", seq: 1 }] }, false), "Delivering");
  assert.equal(driverActivity({ ...base, status: "parked" }, false), "Parked");
});
test("nextDeliveryIndex skips finished stops", () => {
  assert.equal(nextDeliveryIndex([{ status: "complete", seq: 1 }, { status: "planned", seq: 2 }]), 1);
  assert.equal(nextDeliveryIndex([{ status: "complete", seq: 1 }]), -1);
});

import { terminalCode, placeLine, lastPlace } from "./boardStatus.ts";
test("terminal code and place line", () => {
  assert.equal(terminalCode("Buckey North"), "BN");
  assert.equal(terminalCode("Citgo"), "CI");
  assert.equal(placeLine("terminal", "Kinder Morgan", "Tampa"), "KM · Tampa");
  assert.equal(placeLine("store", "Love's 495", null), "Love's 495");
  assert.equal(lastPlace([{ at: "2026-10-01", line: "a" }, { at: "2026-10-05", line: "b" }, { at: null, line: "c" }]), "b");
  assert.equal(lastPlace([]), null);
});

import { storeLabel } from "./boardStatus.ts";
test("store label adds the store number once", () => {
  assert.equal(storeLabel("Love's", "495"), "Love's 495");
  assert.equal(storeLabel("Love's 495", "495"), "Love's 495");
  assert.equal(storeLabel("Love's", null), "Love's");
});
