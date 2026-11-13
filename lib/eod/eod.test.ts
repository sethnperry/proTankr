import test from "node:test";
import assert from "node:assert/strict";
import { buildEod, eodShifts, loadLine, uncoveredMinutes, type EodTrip } from "./eod.ts";
import type { ShiftEventRow } from "../trips/types.ts";

const ev = (id: string, user: string, type: string, at: string): ShiftEventRow => ({ event_id: id, company_id: "c", user_id: user, event_type: type, occurred_at: at, actor_id: user, payload: {}, source: "app" });
const D0 = Date.parse("2026-11-12T05:00:00Z"), D1 = Date.parse("2026-11-13T05:00:00Z"); // an ET day

test("only shifts the driver ended before midnight are in the report", () => {
  const events = [
    ev("1", "a", "shift_start", "2026-11-12T11:00:00Z"), ev("2", "a", "shift_end", "2026-11-12T22:00:00Z"), // ended 5pm: in
    ev("3", "b", "shift_start", "2026-11-12T16:00:00Z"), ev("4", "b", "shift_end", "2026-11-13T06:30:00Z"), // ended 1:30am: out
    ev("5", "c", "shift_start", "2026-11-12T12:00:00Z"), // never ended: out
  ];
  const s = eodShifts(events, ["a", "b", "c"], D0, D1, "2026-11-13T09:00:00Z");
  assert.deepEqual(s.map((x) => x.userId), ["a"]);
});

test("grey zone is shift time no trip or other activity explains, overlaps counted once", () => {
  const from = "2026-11-12T11:00:00Z", to = "2026-11-12T19:00:00Z"; // 8h
  assert.equal(uncoveredMinutes(from, to, []), 480);
  assert.equal(uncoveredMinutes(from, to, [{ from: "2026-11-12T12:00:00Z", to: "2026-11-12T16:00:00Z" }, { from: "2026-11-12T15:00:00Z", to: "2026-11-12T17:00:00Z" }]), 480 - 300);
  assert.equal(uncoveredMinutes(from, to, [{ from: "2026-11-12T08:00:00Z", to: "2026-11-12T22:00:00Z" }]), 0);
});

const trip = (o: Partial<EodTrip>): EodTrip => ({ tripId: "t", userId: "a", truck: "25184", trailer: "3151", fromCity: "Fort Lauderdale", to: "Love's 495", slots: ["D2", null, "D2"], gallons: 7850, minutes: 465, startedAt: "2026-11-12T12:00:00Z", completedAt: "2026-11-12T19:45:00Z", products: [{ name: "ULSD", gallons: 7850 }], ...o });

test("a load line reads the way dispatch asked", () => {
  assert.equal(loadLine("Seth Perry", trip({})), "Seth Perry (25184/3151) * Fort Lauderdale -> Love's 495 * D2/--/D2 * 7,850g * 7h 45m");
});

test("cover groups by area, summarises products and man/grey hours", () => {
  const events = [ev("1", "a", "shift_start", "2026-11-12T11:00:00Z"), ev("2", "a", "shift_end", "2026-11-12T21:00:00Z"), ev("3", "b", "shift_start", "2026-11-12T12:00:00Z"), ev("4", "b", "shift_end", "2026-11-12T20:00:00Z")];
  const shifts = eodShifts(events, ["a", "b"], D0, D1, "2026-11-13T09:00:00Z");
  const r = buildEod({
    drivers: [{ userId: "a", name: "Seth Perry", region: "Southeast", area: "Fort Lauderdale" }, { userId: "b", name: "Ann Lee", region: null, area: null }],
    shifts, trips: [trip({}), trip({ tripId: "t2", userId: "b", startedAt: "2026-11-12T13:00:00Z", completedAt: "2026-11-12T16:00:00Z", minutes: 180, gallons: 6000, products: [{ name: "ULSD", gallons: 3000 }, { name: "Regular", gallons: 3000 }] })],
    other: [],
  });
  assert.deepEqual(r.groups.map((g) => g.title), ["Southeast / Fort Lauderdale", "No area set"]);
  assert.equal(r.summary.loads, 2);
  assert.deepEqual(r.summary.byProduct.map((p) => [p.name, p.gallons]), [["ULSD", 10850], ["Regular", 3000]]);
  assert.equal(r.summary.manMinutes, 600 + 480);
  // a: 10h shift, trip 12:00-19:45 (465 min) -> 135 grey. b: 8h shift, trip 3h -> 300 grey.
  assert.equal(r.summary.greyMinutes, 135 + 300);
});
