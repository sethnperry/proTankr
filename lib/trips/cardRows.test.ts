import test from "node:test";
import assert from "node:assert/strict";
import { deliveryRows, pickupRows } from "./cardRows.ts";

const pk = (o: any) => ({ pickup_id: "p1", seq: 1, name: "Marathon", ...o }) as any;
const dl = (o: any) => ({ delivery_id: "d1", seq: 1, status: "planned", ...o }) as any;
const base = { place: () => "Tampa, FL", noLoadReason: () => "Rack down" };

test("pickup: label follows the stage", () => {
  assert.equal(pickupRows([pk({})], { ...base, currentId: "p1" })[0].label, "Pickup");
  assert.equal(pickupRows([pk({ arrived_at: "x" })], { ...base, currentId: "p1" })[0].label, "Arrived");
  assert.equal(pickupRows([pk({ left_at: "x", load_id: "l" })], { ...base, currentId: null })[0].label, "Loaded");
});
test("pickup: a rack with no product is Tried with its reason", () => {
  const r = pickupRows([pk({ outcome: "no_load" })], { ...base, currentId: null })[0];
  assert.equal(r.label, "Tried");
  assert.equal(r.reason, "Rack down");
});
test("pickup: heading there brightens the city, being there brightens the name", () => {
  assert.deepEqual(pickupRows([pk({})], { ...base, currentId: "p1" }).map((r) => [r.placeBright, r.nameBright]), [[true, false]]);
  assert.deepEqual(pickupRows([pk({ arrived_at: "x" })], { ...base, currentId: "p1" }).map((r) => [r.placeBright, r.nameBright]), [[false, true]]);
});
test("delivery: cancelled drops are hidden, delivered are green", () => {
  const rows = deliveryRows([dl({ status: "cancelled" }), dl({ delivery_id: "d2", seq: 2, status: "complete" })], { place: () => "x", name: () => "Loves", headedId: null });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tone, "done");
});
