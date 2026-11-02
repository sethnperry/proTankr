import test from "node:test";
import assert from "node:assert/strict";
import { checkProblem, feedVariance, latestPerTank, readingRows, tankNameProblem } from "./tankChecks.ts";

const e = (tank: string, value: string, water = "") => ({ tank, value, unit: "gallons" as const, water });

test("a check needs one reading, and every typed reading has to be a number", () => {
  assert.match(checkProblem([e("1", "")]) ?? "", /at least one/);
  assert.equal(checkProblem([e("1", "4,200"), e("2", "")]), null);
  assert.match(checkProblem([e("1", "abc")]) ?? "", /Tank 1/);
  assert.match(checkProblem([e("2", "100", "x")]) ?? "", /water/);
});

test("a new tank name can't repeat one already listed", () => {
  assert.equal(tankNameProblem(" ", []) !== null, true);
  assert.match(tankNameProblem("2", ["1", "2"]) ?? "", /already/);
  assert.equal(tankNameProblem("3", ["1", "2"]), null);
});

const base = {
  checks: [{ check_id: "k1", user_id: "u1", location_id: "L1", location_name: "Store 12", read_at: "2026-11-02T10:00:00Z", photo_paths: [], delivery_id: null },
           { check_id: "k2", user_id: "u1", location_id: "L1", location_name: "Store 12", read_at: "2026-11-02T14:00:00Z", photo_paths: ["p"], delivery_id: "D1" }],
  checkReadings: [{ check_id: "k1", tank_number: "1", product_id: "P1", reading: 3000, reading_unit: "gallons" as const, water_inches: null }],
  drops: [{ delivery_id: "D1", location_id: "L1", store: "Store 12", at: "2026-11-02T14:00:00Z", driverId: "u1" }],
  dropTanks: [{ delivery_id: "D1", tank_number: "1", product_id: "P1", after_reading: 8000, water_reading: 0.5, reading_unit: "gallons" as const }, { delivery_id: "D1", tank_number: "2", product_id: "P2", after_reading: null, water_reading: null, reading_unit: null }],
  productName: (id: string | null) => id ?? "",
};

test("checks and after-drop readings merge by store and tank, newest first; blanks are left out", () => {
  const rows = readingRows(base);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.kind), ["drop", "check"]);
  assert.equal(rows[0].hasPhoto, true); // the drop has a ticket photo
  assert.equal(rows[1].hasPhoto, false);
});

test("latest per tank keeps only the newest reading of each tank at each store", () => {
  const l = latestPerTank(readingRows(base));
  assert.equal(l.length, 1);
  assert.equal(l[0].reading, 8000);
});

test("inches readings are kept as typed", () => {
  const r = readingRows({ ...base, checkReadings: [{ check_id: "k1", tank_number: "9", product_id: null, reading: 41.5, reading_unit: "inches", water_inches: null }] });
  assert.equal(r.find((x) => x.tank === "9")?.unit, "inches");
});

test("feed variance flags only past the tolerance", () => {
  assert.equal(feedVariance(1000, 960, 50)?.over, false);
  assert.equal(feedVariance(1000, 900, 50)?.over, true);
  assert.equal(feedVariance(null, 900, 50), null);
});
