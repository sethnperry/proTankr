import test from "node:test";
import assert from "node:assert/strict";
import { moveMiles, moveMinutes, newMove, openMove, suggestKind, summarizeMoves } from "./emptyMoves.ts";
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
