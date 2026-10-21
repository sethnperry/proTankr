import test from "node:test";
import assert from "node:assert/strict";
import { buildIftaReport, iftaCsv, quarterOf, quarterRange } from "./report.ts";

test("quarters: range and which quarter a date is in", () => {
  assert.deepEqual(quarterRange(2026, 4), { from: "2026-10-01", to: "2026-12-31", label: "Q4 2026" });
  assert.deepEqual(quarterRange(2026, 1), { from: "2026-01-01", to: "2026-03-31", label: "Q1 2026" });
  assert.deepEqual(quarterOf("2026-08-15"), { year: 2026, q: 3 });
});

test("report: miles and gallons by state, per truck and fleet, MPG, NONE ignored, OUT last", () => {
  const r = buildIftaReport(
    [
      { truck_id: "t1", state: "FL", miles: 300 }, { truck_id: "t1", state: "GA", miles: 100 }, { truck_id: "t2", state: "FL", miles: 200 },
      { truck_id: "t1", state: "OUT", miles: 10 }, { truck_id: "t2", state: "NONE", miles: 0 },
    ],
    [{ truck_id: "t1", state: "FL", gallons: 50 }, { truck_id: "t2", state: "GA", gallons: 30 }, { truck_id: "t1", state: null, gallons: 20 }],
    (id) => ({ t1: "25184", t2: "25512" }[id] ?? id),
  );
  assert.deepEqual(r.states.map((s) => [s.state, s.miles, s.gallons]), [["FL", 500, 50], ["GA", 100, 30], ["OUT", 10, 0]]);
  assert.equal(r.totalMiles, 610);
  assert.equal(r.totalGallons, 100);
  assert.equal(r.gallonsNoState, 20);
  assert.equal(r.mpg, 6.1);
  assert.deepEqual(r.trucks.map((t) => [t.name, t.miles, t.gallons]), [["25184", 410, 50], ["25512", 200, 30]]);
});

test("csv: header, per-truck rows, fleet rows, quoting", () => {
  const r = buildIftaReport([{ truck_id: "t1", state: "FL", miles: 12.34 }], [], () => 'Big "Red"');
  const csv = iftaCsv(r, "Q4 2026").split("\n");
  assert.equal(csv[0], '"Quarter","Truck","State","Miles","Gallons purchased"');
  assert.equal(csv[1], '"Q4 2026","Big ""Red""","FL",12.3,0');
  assert.equal(csv[2], '"Q4 2026","ALL TRUCKS","FL",12.3,0');
});
