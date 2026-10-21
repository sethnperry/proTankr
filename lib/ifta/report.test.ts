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

import { purchaseState } from "./report.ts";
test("purchaseState: the recorded state wins, else lat/lon, else unknown", () => {
  const lookup = () => "GA";
  assert.equal(purchaseState({ state: "fl", lat: 1, lon: 1 }, lookup), "FL");
  assert.equal(purchaseState({ state: null, lat: 33.7, lon: -84.4 }, lookup), "GA");
  assert.equal(purchaseState({ state: " ", lat: null, lon: null }, lookup), null);
});

import { iftaReturn, iftaReturnCsv } from "./report.ts";
test("return worksheet: fleet MPG, taxable gallons, net taxable; AK/HI/OUT and no-state gallons set aside", () => {
  const rep = buildIftaReport(
    [{ truck_id: "t1", state: "FL", miles: 600 }, { truck_id: "t1", state: "GA", miles: 400 }, { truck_id: "t1", state: "OUT", miles: 50 }, { truck_id: "t1", state: "AK", miles: 20 }],
    [{ truck_id: "t1", state: "FL", gallons: 100 }, { truck_id: "t1", state: "GA", gallons: 50 }, { truck_id: "t1", state: null, gallons: 25 }],
    () => "25184",
  );
  const ret = iftaReturn(rep);
  assert.equal(ret.mpg, 6.67); // 1000 mi / 150 gal (the no-state gallons aren't in a jurisdiction)
  assert.deepEqual(ret.lines.map((l) => [l.jurisdiction, l.totalMiles, l.taxableGallons, l.taxPaidGallons, l.netTaxableGallons]), [["FL", 600, 90, 100, -10], ["GA", 400, 60, 50, 10]]);
  assert.equal(ret.skippedMiles, 70);
  assert.equal(ret.noStateGallons, 25);
  const csv = iftaReturnCsv(rep, "Q4 2026").split("\n");
  assert.equal(csv[0], '"Quarter","Jurisdiction","Total miles","Taxable miles","Fleet MPG","Taxable gallons","Tax-paid gallons","Net taxable gallons"');
  assert.equal(csv[1], '"Q4 2026","FL",600,600,6.67,90,100,-10');
  assert.equal(csv[3], '"Q4 2026","TOTAL",1000,1000,6.67,150,150,0');
});

test("return worksheet: Canadian provinces are jurisdictions, but NT and NU aren't", () => {
  const rep = buildIftaReport(
    [{ truck_id: "t", state: "MI", miles: 500 }, { truck_id: "t", state: "ON", miles: 300 }, { truck_id: "t", state: "QC", miles: 100 }, { truck_id: "t", state: "NT", miles: 40 }],
    [{ truck_id: "t", state: "MI", gallons: 80 }, { truck_id: "t", state: "ON", gallons: 45 }],
    () => "1",
  );
  const ret = iftaReturn(rep);
  assert.deepEqual(ret.lines.map((l) => l.jurisdiction), ["MI", "ON", "QC"]);
  assert.equal(ret.skippedMiles, 40);
});
