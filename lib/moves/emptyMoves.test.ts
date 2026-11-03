import test from "node:test";
import assert from "node:assert/strict";
import { autoEndReason, autoStartCandidate, odometerMissing, placeAt, moveMiles, moveMinutes, newMove, openMove, suggestKind, summarizeMoves } from "./emptyMoves.ts";
import { nearbyPlaces } from "../trips/deliveryLocations.ts";

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

const trip = (o: any) => ({ trip_id: "t1", driver_id: "d", status: "cancelled", cancelled_at: "2026-11-03T14:00:00Z", completed_at: null, ...o });
const NOW = Date.parse("2026-11-03T14:30:00Z");
test("a trip that just ended opens a move once", () => {
  const c = autoStartCandidate({ trips: [trip({})] as any, moves: [], driverId: "d", hasOpenTrip: false, nowMs: NOW });
  assert.equal(c?.tripId, "t1");
  assert.equal(autoStartCandidate({ trips: [trip({})] as any, moves: [{ ...base, started_at: "2026-11-03T14:01:00Z" } as any], driverId: "d", hasOpenTrip: false, nowMs: NOW }), null);
  assert.equal(autoStartCandidate({ trips: [trip({})] as any, moves: [], driverId: "d", hasOpenTrip: true, nowMs: NOW }), null);
  assert.equal(autoStartCandidate({ trips: [trip({ cancelled_at: "2026-11-03T02:00:00Z" })] as any, moves: [], driverId: "d", hasOpenTrip: false, nowMs: NOW }), null);
  assert.equal(autoStartCandidate({ trips: [trip({ status: "complete", completed_at: "2026-11-03T14:10:00Z" })] as any, moves: [], driverId: "d", hasOpenTrip: false, nowMs: NOW })?.tripId, "t1");
  assert.equal(autoStartCandidate({ trips: [trip({ status: "in_transit" })] as any, moves: [], driverId: "d", hasOpenTrip: false, nowMs: NOW }), null);
});
const yard = { location_id: "y", name: "Yard", lat: 26.64, lon: -81.87, starred: false, is_active: true } as any;
const mv = (o: any = {}) => ({ ...base, started_at: "2026-11-03T14:00:00Z", from_place_id: "other", ...o }) as any;
test("move ends on a new trip, on a shift end, or when stopped at a saved place", () => {
  const still = { lat: 26.6401, lon: -81.87, speedMph: 0 };
  assert.equal(autoEndReason({ move: mv(), hasOpenTrip: true, shiftActive: true, pos: null, locations: [], nowMs: NOW })?.reason, "trip_begun");
  assert.equal(autoEndReason({ move: mv(), hasOpenTrip: false, shiftActive: false, pos: null, locations: [], nowMs: NOW })?.reason, "shift_ended");
  assert.equal(autoEndReason({ move: mv(), hasOpenTrip: false, shiftActive: true, pos: still, locations: [yard], nowMs: NOW })?.place?.location_id, "y");
  assert.equal(autoEndReason({ move: mv(), hasOpenTrip: false, shiftActive: true, pos: { ...still, speedMph: 40 }, locations: [yard], nowMs: NOW }), null);
  assert.equal(autoEndReason({ move: mv({ from_place_id: "y" }), hasOpenTrip: false, shiftActive: true, pos: still, locations: [yard], nowMs: NOW }), null);
  assert.equal(autoEndReason({ move: mv({ started_at: "2026-11-03T14:28:00Z" }), hasOpenTrip: false, shiftActive: true, pos: still, locations: [yard], nowMs: NOW }), null);
  assert.equal(placeAt([yard], { lat: 27, lon: -82 }), null);
});
test("the driver is asked for an odometer only when telematics left it blank", () => {
  assert.equal(odometerMissing({ begin_miles: 5, end_miles: null, ended_at: null }), null);
  assert.equal(odometerMissing({ begin_miles: null, end_miles: null, ended_at: null }), "begin");
  assert.equal(odometerMissing({ begin_miles: 5, end_miles: null, ended_at: "x" }), "end");
});

import { emptyMoveRows } from "../trips/deadheadReport.ts";
test("finished empty moves become report rows; open and cancelled ones do not", () => {
  const done = { ...base, move_id: "a", ended_at: "2026-11-03T11:00:00Z", billable: true } as any;
  const rows = emptyMoveRows([done, base as any, { ...done, move_id: "c", notes: "Cancelled" }], (id, t) => id ?? t ?? "?");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].moveId, "a");
  assert.equal(rows[0].minutes, 60);
  assert.equal(rows[0].billable, true);
  assert.equal(rows[0].kind, "move");
});
