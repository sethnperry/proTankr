import test from "node:test";
import assert from "node:assert/strict";
import { moveFromStamp, odometerProblem, parseOdometer, placeFor, moveMiles, moveMinutes, newMove, openMove, suggestKind, summarizeMoves } from "./emptyMoves.ts";
import { nearbyPlaces } from "../trips/deliveryLocations.ts";
import { emptyMoveRows } from "../trips/deadheadReport.ts";

const base = newMove({ id: "m1", companyId: "c", driverId: "d", truckId: "t", trailerId: null, kind: "bobtail", from: { id: "p1", text: null }, to: { id: null, text: " Yard 2 " }, beginMiles: 100, nowIso: "2026-11-03T10:00:00Z" });

test("new move is open, trims text, and the open one is found", () => {
  assert.equal(base.to_text, "Yard 2");
  assert.equal(openMove([base as any], "d")?.move_id, "m1");
  assert.equal(openMove([{ ...base, ended_at: "2026-11-03T11:00:00Z" } as any], "d"), null);
  assert.equal(openMove([base as any], "other"), null);
});
test("kind follows the trailer; miles and minutes", () => {
  assert.equal(suggestKind(false), "bobtail");
  assert.equal(suggestKind(true), "empty_return");
  assert.equal(moveMiles({ begin_miles: 100, end_miles: 112.34 }), 12.3);
  assert.equal(moveMiles({ begin_miles: 100, end_miles: 90 }), null);
  assert.equal(moveMinutes({ started_at: "2026-11-03T10:00:00Z", ended_at: "2026-11-03T10:45:00Z" }), 45);
});
test("summary totals by kind and counts unreviewed", () => {
  const a = { ...base, ended_at: "2026-11-03T10:30:00Z", end_miles: 110, billable: true } as any;
  const b = { ...base, move_id: "m2", kind: "reposition", ended_at: "2026-11-03T11:00:00Z" } as any;
  const s = summarizeMoves([a, b]);
  assert.equal(s.totalMinutes, 90);
  assert.equal(s.unreviewed, 1);
  assert.equal(s.billableMin, 30);
  assert.equal(s.byKind.get("bobtail")?.miles, 10);
});
test("nearby places: within range, nearest first, no coords or retired left out", () => {
  const o = { lat: 27.95, lon: -82.46 };
  const mk = (name: string, lat: number | null, lon: number | null, extra = {}) => ({ name, lat, lon, starred: false, is_active: true, ...extra });
  const r = nearbyPlaces([mk("far", 28.5, -82.46), mk("near", 27.951, -82.46), mk("nocoord", null, null), mk("gone", 27.95, -82.46, { is_active: false }), mk("mid", 27.98, -82.46)], o);
  assert.deepEqual(r.map((x) => x.name), ["near", "mid"]);
  assert.deepEqual(nearbyPlaces([mk("a", 27.95, -82.46)], null), []);
});

test("odometer entry: required, numeric, not below the start", () => {
  assert.equal(odometerProblem("", null), "Enter the odometer.");
  assert.equal(odometerProblem("abc", null), "That isn't a valid odometer.");
  assert.equal(odometerProblem("0", null), "That isn't a valid odometer.");
  assert.equal(odometerProblem("412,300", 412000), null);
  assert.match(odometerProblem("411999", 412000)!, /Lower than the last reading \(412,000\)/);
  assert.equal(parseOdometer(" 412,300 "), 412300);
  assert.equal(parseOdometer(""), null);
});
const yard = { location_id: "y", name: "Yard", lat: 26.64, lon: -81.87, starred: false, is_active: true } as any;
test("place: a saved place within 0.3 mi, else the city text, else blank", () => {
  assert.deepEqual(placeFor([yard], { lat: 26.6401, lon: -81.87 }, "Fort Myers, FL"), { id: "y", text: null });
  assert.deepEqual(placeFor([yard], { lat: 27, lon: -82 }, " Fort Myers, FL "), { id: null, text: "Fort Myers, FL" });
  assert.deepEqual(placeFor([yard], null, null), { id: null, text: null });
});
test("a cancel stamp opens a move at the stamp time and odometer; kind follows the trailer", () => {
  const stamp = { at: "2026-11-03T05:38:00Z", odometer: 412000, lat: null, lon: null, placeId: "gs", placeText: null, source: "terminal" as const };
  const m = moveFromStamp({ id: "m", companyId: "c", driverId: "d", truckId: "t", trailerId: null, stamp });
  assert.equal(m.started_at, "2026-11-03T05:38:00Z");
  assert.equal(m.begin_miles, 412000);
  assert.equal(m.from_place_id, "gs");
  assert.equal(m.kind, "bobtail");
  assert.equal(moveFromStamp({ id: "m", companyId: "c", driverId: "d", truckId: "t", trailerId: "r", stamp }).kind, "empty_return");
});
test("finished empty moves become report rows; open and cancelled ones do not", () => {
  const done = { ...base, move_id: "a", ended_at: "2026-11-03T11:00:00Z", billable: true } as any;
  const rows = emptyMoveRows([done, base as any, { ...done, move_id: "c", notes: "Cancelled" }], (id, t) => id ?? t ?? "?");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].moveId, "a");
  assert.equal(rows[0].minutes, 60);
  assert.equal(rows[0].billable, true);
  assert.equal(rows[0].kind, "move");
});
