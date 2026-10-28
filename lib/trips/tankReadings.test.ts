import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtSignedGallons, tankDiscrepancy, tanksForProduct, sortTankNames } from "./tankReadings.ts";

test("sums the rise across every tank of the product", () => {
  // Dropped 6,800 into tanks 1 and 2; tank 3 leveled with them.
  const d = tankDiscrepancy(6800, [
    { before: 2000, after: 4300 },
    { before: 1500, after: 3800 },
    { before: 1800, after: 3950 },
  ], "gallons");
  assert.deepEqual(d, { rise: 6750, delivered: 6800, diff: -50, level: "warn" });
});

test("levels: within 25 ok, over 25 warn, over 100 bad", () => {
  assert.equal(tankDiscrepancy(1000, [{ before: 0, after: 975 }], "gallons")?.level, "ok");
  assert.equal(tankDiscrepancy(1000, [{ before: 0, after: 974 }], "gallons")?.level, "warn");
  assert.equal(tankDiscrepancy(1000, [{ before: 0, after: 1100 }], "gallons")?.level, "warn");
  assert.equal(tankDiscrepancy(1000, [{ before: 0, after: 1101 }], "gallons")?.level, "bad");
});

test("no comparison in inches or with a missing reading", () => {
  assert.equal(tankDiscrepancy(1000, [{ before: 20, after: 60 }], "inches"), null);
  assert.equal(tankDiscrepancy(1000, [{ before: 0, after: 900 }, { before: 10, after: null }], "gallons"), null);
  assert.equal(tankDiscrepancy(1000, [], "gallons"), null);
});

test("tanks for a product: saved ones plus typed ones, numeric order", () => {
  const loc = [
    { tank_number: "10", product_id: "d2" },
    { tank_number: "2", product_id: "d2" },
    { tank_number: "3", product_id: "87" },
    { tank_number: "4", product_id: "d2", is_active: false },
  ];
  assert.deepEqual(tanksForProduct("d2", loc, [{ tank_number: " 2 ", product_id: "d2" }, { tank_number: "7", product_id: "d2" }]), ["2", "7", "10"]);
  assert.deepEqual(tanksForProduct(null, loc, []), []);
});

test("signed gallons", () => {
  assert.equal(fmtSignedGallons(-50.4), "−50 gal");
  assert.equal(fmtSignedGallons(1234), "+1,234 gal");
  assert.equal(fmtSignedGallons(0.2), "±0 gal");
});

test("after reading prefill", async () => {
  const { prefillAfter } = await import("./tankReadings.ts");
  assert.equal(prefillAfter(1200, 3800.4, "gallons"), 5000);
  assert.equal(prefillAfter(1200, 0, "gallons"), 1200);
  assert.equal(prefillAfter(null, 3800, "gallons"), null);
  assert.equal(prefillAfter(40, 3800, "inches"), null);
});

test("tank names follow the driver's order, then by name", () => {
  const order = new Map([["EAST", 0], ["CENTER", 1], ["WEST", 2]]);
  assert.deepEqual(sortTankNames(["WEST", "CENTER", "EAST"], order), ["EAST", "CENTER", "WEST"]);
  assert.deepEqual(sortTankNames(["WEST", "NEW", "EAST"], order), ["EAST", "WEST", "NEW"]);
  assert.deepEqual(sortTankNames(["10", "2", "1"], null), ["1", "2", "10"]);
});
