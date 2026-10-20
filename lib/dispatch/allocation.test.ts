import test from "node:test";
import assert from "node:assert/strict";
import { buildUsageItems, contractUsage, windows, levelFor, wouldExceed, typicalGallons, type AllocContract, type RawTrip } from "./allocation.ts";

const TZ = "America/New_York"; // EDT, UTC-4 on these dates
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 9, day, h + 4, m);
const iso = (ms: number) => new Date(ms).toISOString();
const c: AllocContract = { supplier_id: "S", terminal_id: "T", limit_basis: "loads", per_day: 4, per_week: 14, reset_dow: 1, reset_time: "06:00", paused: false };

function loaded(day: number, h: number, gal = 8000, supplier = "S"): RawTrip {
  return { status: "complete", planned_start_at: null, started_at: iso(at(day, h - 1)),
    pickups: [{ pickup_id: `p${day}${h}`, terminal_id: "T", supplier_id: null, arrived_at: iso(at(day, h - 1)), left_at: iso(at(day, h)), outcome: "loaded", seq: 1 }],
    compLoads: [{ pickup_id: `p${day}${h}`, supplier_id: supplier, gross_gallons: gal, disposition: "delivered" }] };
}
const dispatched = (day: number, h: number): RawTrip => ({ status: "dispatched", planned_start_at: iso(at(day, h)), started_at: null,
  pickups: [{ pickup_id: "d", terminal_id: "T", supplier_id: "S", arrived_at: null, left_at: null, outcome: null, seq: 1 }], compLoads: [] });

test("the day starts at the reset time, the week at the reset day (2026-10-21 is a Wednesday)", () => {
  const w = windows(at(21, 10), "06:00", 1, TZ);
  assert.equal(w.dayStart, at(21, 6));
  assert.equal(w.weekStart, at(19, 6));          // Monday 6 AM
  // before the reset time the day belongs to yesterday's window
  assert.equal(windows(at(21, 3), "06:00", 1, TZ).dayStart, at(20, 6));
});

test("loaded and booked count in the window; other days and suppliers don't", () => {
  const items = buildUsageItems([loaded(21, 7), loaded(21, 9), loaded(20, 8), loaded(21, 8, 8000, "other"), dispatched(21, 14)]);
  const u = contractUsage(c, items, at(21, 10), TZ);
  assert.deepEqual([u.day.loaded, u.day.booked, u.day.limit], [2, 1, 4]);
  assert.equal(u.week.loaded, 3);               // Monday-onward: 20th and 21st
  assert.equal(u.level, "near");       // 3 of 4 today
});

test("levels: near at 75%, full at the limit, over past it", () => {
  assert.equal(levelFor(3, 4), "near");
  assert.equal(levelFor(4, 4), "full");
  assert.equal(levelFor(5, 4), "over");
  assert.equal(levelFor(5, null), "none");
});

test("by gallons: booked loads use the supplier's typical size", () => {
  const g: AllocContract = { ...c, limit_basis: "gallons", per_day: 20000, per_week: null };
  const items = buildUsageItems([loaded(21, 7, 9000), loaded(21, 9, 7000), dispatched(21, 14)]);
  assert.equal(typicalGallons(items, "S", "T"), 8000);
  const u = contractUsage(g, items, at(21, 10), TZ);
  assert.deepEqual([u.day.loaded, u.day.booked], [16000, 8000]);
  assert.equal(u.day.level, "over");
});

test("a cancelled trip and a no-load rack use nothing; a pickup chosen but not loaded is booked", () => {
  const noLoad: RawTrip = { ...loaded(21, 9), pickups: [{ ...loaded(21, 9).pickups[0], outcome: "no_load" }] };
  const cancelled: RawTrip = { ...loaded(21, 9), status: "cancelled" };
  const pending: RawTrip = { status: "draft", planned_start_at: null, started_at: iso(at(21, 8)), compLoads: [],
    pickups: [{ pickup_id: "q", terminal_id: "T", supplier_id: "S", arrived_at: iso(at(21, 8)), left_at: null, outcome: null, seq: 1 }] };
  const u = contractUsage(c, buildUsageItems([noLoad, cancelled, pending]), at(21, 10), TZ);
  assert.deepEqual([u.day.loaded, u.day.booked], [0, 1]);
});

test("the warning names the limit one more load would break", () => {
  const items = buildUsageItems([loaded(21, 7), loaded(21, 8), loaded(21, 9), dispatched(21, 14)]);
  const u = contractUsage(c, items, at(21, 10), TZ);
  assert.match(wouldExceed(u, "Atlas - MO", 1)!, /daily limit: 4 of 4 loads/);
  assert.equal(wouldExceed(contractUsage(c, [], at(21, 10), TZ), "Atlas - MO", 1), null);
});
