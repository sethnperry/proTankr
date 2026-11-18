import test from "node:test";
import assert from "node:assert/strict";
import { cutShift, type PlaceNames } from "./segments.ts";
import { buildStandards } from "./standards.ts";
import { scoreShifts } from "./score.ts";
import { buildRecap } from "./report.ts";
import { DEFAULT_RECAP_SETTINGS, type RecapTrip, type Segment } from "./types.ts";
import type { Shift } from "../shifts/shiftLogic.ts";
import { bucketOf, localParts, median } from "./time.ts";

const S = DEFAULT_RECAP_SETTINGS;
const S0 = { ...S, learningVisits: 0 }; // no new-place allowance, so standards read plainly
const TZ = "America/New_York";
const at = (hhmm: string, day = "2026-11-16") => `${day}T${hhmm}:00-05:00`;
const names: PlaceNames = { terminal: (id) => (id ? `Term ${id}` : ""), location: (id) => (id ? `Store ${id}` : "") };
const shift = (userId: string, start: string, end: string, over: Partial<Shift> = {}): Shift => ({ userId, startedAt: at(start), endedAt: at(end), open: false, unconfirmed: false, startSource: "geotab", endSource: "app", events: [], hours: 0, ...over });
const trip = (userId: string, over: Partial<RecapTrip> = {}): RecapTrip => ({
  tripId: `t-${userId}`, userId, startedAt: at("06:20"), completedAt: at("10:00"), gallons: 8000,
  pickups: [{ pickupId: "p1", terminalId: "A", name: "Term A", arrivedAt: at("06:50"), beginAt: at("07:00"), leftAt: at("07:40"), outcome: "loaded", noLoadReason: null, hasDelayNote: false }],
  deliveries: [{ deliveryId: "d1", locationId: "X", name: "Store X", arrivedAt: at("09:10"), beginAt: at("09:15"), leftAt: at("09:50"), signed: true, hasDelayNote: false }],
  delays: [], ...over,
});

test("local parts and buckets", () => {
  const p = localParts(Date.parse("2026-11-16T12:30:00Z"), TZ); // 07:30 EST, a Monday
  assert.deepEqual(p, { date: "2026-11-16", hour: 7, dow: 0 });
  assert.equal(bucketOf(5), 0); assert.equal(bucketOf(6), 1); assert.equal(bucketOf(9), 2); assert.equal(bucketOf(15), 3); assert.equal(bucketOf(19), 4);
  assert.equal(median([1, 9, 3]), 3); assert.equal(median([1, 3]), 2); assert.equal(median([]), null);
});

test("a shift is cut into empty leg, rack, loaded leg, drop, and gray zone around them", () => {
  const segs = cutShift(shift("u1", "06:00", "10:30"), [trip("u1")], [], names, S, TZ);
  assert.deepEqual(segs.map((g) => g.type), ["gray", "empty_leg", "rack", "loaded_leg", "drop", "gray"]);
  assert.equal(segs[0].grayKind, "start"); assert.equal(segs[0].minutes, 20);
  assert.equal(segs[1].minutes, 30); assert.equal(segs[2].minutes, 50);
  assert.equal(segs[3].minutes, 90); assert.equal(segs[4].minutes, 40);
  assert.equal(segs[5].grayKind, "end"); assert.equal(segs[5].minutes, 40);
  assert.equal(segs[2].evidence, true); assert.equal(segs[4].evidence, true);
});

test("a no-load rack hop leaves the next leg empty, and an unsigned drop has no evidence", () => {
  const t = trip("u1", {
    pickups: [
      { pickupId: "p0", terminalId: "B", name: "Term B", arrivedAt: at("06:40"), beginAt: null, leftAt: at("06:55"), outcome: "no_load", noLoadReason: "out_of_allocation", hasDelayNote: false },
      { pickupId: "p1", terminalId: "A", name: "Term A", arrivedAt: at("07:20"), beginAt: at("07:30"), leftAt: at("08:00"), outcome: "loaded", noLoadReason: null, hasDelayNote: false },
    ],
    deliveries: [{ deliveryId: "d1", locationId: "X", name: "Store X", arrivedAt: at("09:00"), beginAt: at("09:05"), leftAt: at("09:40"), signed: false, hasDelayNote: false }],
  });
  const segs = cutShift(shift("u1", "06:00", "10:00"), [t], [], names, S, TZ);
  assert.deepEqual(segs.filter((g) => g.type !== "gray").map((g) => g.type), ["empty_leg", "rack", "empty_leg", "rack", "loaded_leg", "drop"]);
  assert.equal(segs.find((g) => g.type === "drop")!.evidence, false);
});

test("fuel stops and empty moves are recognized time, and overlaps count once", () => {
  const segs = cutShift(shift("u1", "06:00", "10:30"), [trip("u1")], [{ userId: "u1", from: at("08:00"), to: at("08:30"), kind: "fuel" }], names, S, TZ);
  const total = segs.reduce((n, g) => n + g.minutes, 0);
  assert.equal(Math.round(total), 270); // exactly the shift, no double counting
  assert.ok(segs.some((g) => g.type === "fuel" && g.minutes === 30));
});

test("delays logged at the rack are attached to that rack segment", () => {
  const t = trip("u1", { delays: [{ leg: "at_rack", code: "long_line", label: "Long line", note: null, minutes: 25, startedAt: at("06:55"), endedAt: at("07:20"), pickupId: "p1", deliveryId: null }] });
  const rack = cutShift(shift("u1", "06:00", "10:30"), [t], [], names, S, TZ).find((g) => g.type === "rack")!;
  assert.equal(rack.liveDelayMin, 25); assert.deepEqual(rack.delayLabels, ["Long line"]);
});

function history(n: number, minutes: number): Segment[] {
  return Array.from({ length: n }, (_, k) => ({
    userId: `h${k}`, shiftStart: at("06:00"), type: "rack" as const, startMs: Date.parse(at("07:00")), endMs: Date.parse(at("07:00")) + minutes * 60000, minutes,
    key: "t:A", fromKey: "t:A", toKey: "t:A", label: "Term A", hour: 7, dow: 0, liveDelayMin: 0, delayLabels: [], afterNote: false, evidence: true,
  }));
}

test("a standard needs enough distinct drivers and no one driver over a quarter of the samples", () => {
  assert.equal(buildStandards(history(4, 40), S, "v1").rows.size, 0);
  const ok = buildStandards(history(5, 40), S, "v1");
  assert.equal(ok.rows.get("rack|t:A|1")!.minutes, 40);
  // Five drivers but one supplies most of the samples: refused.
  const skew = [...history(5, 40), ...history(1, 40).flatMap(() => Array.from({ length: 30 }, () => history(1, 40)[0]))].map((g, i) => (i >= 5 ? { ...g, userId: "h0" } : g));
  assert.equal(buildStandards(skew, S, "v1").rows.size, 0);
});

test("credit is capped at the standard, verified wait adds back, and ATR is credit over on-duty time", () => {
  const std = buildStandards(history(5, 40), S, "v1");
  // The driver is slow at the rack: 50 min against a 40 min standard, with 10 min of live-logged delay.
  const t = trip("u1", { delays: [{ leg: "at_rack", code: "long_line", label: "Long line", note: null, minutes: 10, startedAt: at("07:00"), endedAt: at("07:10"), pickupId: "p1", deliveryId: null }] });
  const sh = shift("u1", "06:00", "10:30");
  const [score] = scoreShifts([{ shift: sh, segments: cutShift(sh, [t], [], names, S, TZ) }], std, S0, () => null);
  const rack = score.segments.find((g) => g.type === "rack")!;
  assert.equal(rack.standardMin, 40); assert.equal(rack.excessMin, 10); assert.equal(rack.waitCredited, 10);
  assert.equal(rack.credit, 50); // min(50,40) + 10 wait, evidence 1
  assert.equal(score.onDutyMin, 270);
});

test("a faster-than-standard segment earns only the standard", () => {
  const std = buildStandards(history(5, 60), S, "v1"); // standard 60, driver takes 50
  const sh = shift("u1", "06:00", "10:30");
  const [score] = scoreShifts([{ shift: sh, segments: cutShift(sh, [trip("u1")], [], names, S, TZ) }], std, S0, () => null);
  const rack = score.segments.find((g) => g.type === "rack")!;
  assert.equal(rack.credit, 50); assert.equal(rack.excessMin, 0);
});

test("missing evidence halves the credit", () => {
  const std = buildStandards(history(5, 60), S, "v1");
  const t = trip("u1", { pickups: [{ ...trip("u1").pickups[0], beginAt: null }] }); // no begin: evidence missing
  const sh = shift("u1", "06:00", "10:30");
  const [score] = scoreShifts([{ shift: sh, segments: cutShift(sh, [t], [], names, S, TZ) }], std, S0, () => null);
  assert.equal(score.segments.find((g) => g.type === "rack")!.credit, 25);
});

test("gray zone: credited up to its allowance and the shift cap; the end tail only when ended by hand", () => {
  const std = buildStandards([], S, "v1");
  const sh = shift("u1", "06:00", "10:30"); // 20 start gap, 40 end gap
  const [byHand] = scoreShifts([{ shift: sh, segments: cutShift(sh, [trip("u1")], [], names, S, TZ) }], std, S, () => null);
  const grays = byHand.segments.filter((g) => g.type === "gray");
  assert.equal(grays[0].credit, 20); assert.equal(grays[1].credit, 20); assert.equal(grays[1].unaccounted, 20);
  const auto = shift("u1", "06:00", "10:30", { endSource: "geotab" });
  const [byAuto] = scoreShifts([{ shift: auto, segments: cutShift(auto, [trip("u1")], [], names, S, TZ) }], std, S, () => null);
  assert.equal(byAuto.segments.filter((g) => g.type === "gray")[1].credit, 0);
  const capped = { ...S, shiftGrayCapMin: 25 };
  const [c] = scoreShifts([{ shift: sh, segments: cutShift(sh, [trip("u1")], [], names, capped, TZ) }], std, capped, () => null);
  assert.equal(c.segments.filter((g) => g.type === "gray").reduce((n, g) => n + g.credit, 0), 25);
});

test("peers running the same place and hour slow verify a wait; one peer is not enough", () => {
  const std = buildStandards(history(5, 40), S, "v1");
  const slowTrip = (u: string) => trip(u, { pickups: [{ ...trip(u).pickups[0], arrivedAt: at("07:00"), beginAt: at("07:05"), leftAt: at("08:10") }] }); // 70 min vs 40
  const mk = (u: string) => { const sh = shift(u, "06:00", "10:30"); return { shift: sh, segments: cutShift(sh, [slowTrip(u)], [], names, S, TZ) }; };
  const four = scoreShifts(["a", "b", "c", "d"].map(mk), std, S0, () => null);
  assert.equal(four[0].segments.find((g) => g.type === "rack")!.corroborated, true); // 3 others
  const two = scoreShifts(["a", "b"].map(mk), std, S0, () => null);
  assert.equal(two[0].segments.find((g) => g.type === "rack")!.corroborated, false);
});

test("the recap: ATR per driver, insufficient data under 3 shifts, ledger by cause, region tiles", () => {
  const std = buildStandards(history(5, 40), S, "v1");
  const dr = [{ userId: "u1", name: "Ann", region: "SE", area: null }, { userId: "u2", name: "Bob", region: "SE", area: null }];
  const sc = [
    ...["16", "17", "18"].map((d) => { const sh = { ...shift("u1", "06:00", "10:30"), startedAt: at("06:00", `2026-11-${d}`), endedAt: at("10:30", `2026-11-${d}`) }; return { shift: sh, segments: cutShift(sh, [trip("u1", { startedAt: at("06:20", `2026-11-${d}`), pickups: [{ ...trip("u1").pickups[0], arrivedAt: at("06:50", `2026-11-${d}`), beginAt: at("07:00", `2026-11-${d}`), leftAt: at("07:40", `2026-11-${d}`) }], deliveries: [{ ...trip("u1").deliveries[0], arrivedAt: at("09:10", `2026-11-${d}`), beginAt: at("09:15", `2026-11-${d}`), leftAt: at("09:50", `2026-11-${d}`) }] })], [], names, S, TZ) }; }),
    (() => { const sh = shift("u2", "06:00", "10:30"); return { shift: sh, segments: cutShift(sh, [trip("u2")], [], names, S, TZ) }; })(),
  ];
  const scores = scoreShifts(sc, std, S, () => null);
  const r = buildRecap({ companyName: "Acme", weekStart: "2026-11-16", weekEnd: "2026-11-22", tz: TZ, standardsVersion: "v1", settings: S, drivers: dr, scores, trips: [trip("u1"), trip("u2")], recovery: { u1: { pct: 0.98, loads: 3, under: 1, flagged: 0 } }, regionRecovery: { pct: 0.98, loads: 3 }, prior: null, generatedAt: "2026-11-23T09:00:00Z" });
  assert.equal(r.drivers.find((d) => d.name === "Bob")!.insufficient, true);
  assert.equal(r.drivers[0].name, "Ann"); // insufficient data sorts last
  assert.ok((r.drivers[0].atr ?? 0) > 0 && (r.drivers[0].atr ?? 0) <= 100);
  assert.equal(r.tiles.length, 6);
  assert.ok(r.ledger.causes.length >= 1);
  assert.equal(r.completeness, 1);
});
