import test from "node:test";
import assert from "node:assert/strict";
import { cityKey, extractLaneLegs, lookupLane, statKey, laneKey, type LaneBook, type LaneStat } from "./laneStats.ts";
import { standardFor, type Standards } from "./standards.ts";
import { DEFAULT_RECAP_SETTINGS, type RecapTrip, type Segment } from "./types.ts";

const at = (hhmm: string) => `2026-11-16T${hhmm}:00-05:00`;
const info = (k: string) => ({ name: k, city: k.startsWith("t:") ? cityKey("Tampa", "FL") : cityKey("Orlando", "FL") });
const trip = (over: Partial<RecapTrip> = {}): RecapTrip => ({
  tripId: "T1", userId: "u", startedAt: at("06:00"), completedAt: at("12:00"), gallons: 8000, delays: [],
  pickups: [{ pickupId: "p1", terminalId: "A", name: "A", arrivedAt: at("06:30"), beginAt: at("06:40"), leftAt: at("07:30"), outcome: "loaded", noLoadReason: null, hasDelayNote: false, odometer: 1000 }],
  deliveries: [{ deliveryId: "d1", locationId: "X", name: "X", arrivedAt: at("09:30"), beginAt: at("09:35"), leftAt: at("10:30"), signed: true, hasDelayNote: false, odometer: 1090 }],
  ...over,
});

test("cityKey is case and space insensitive and needs both parts", () => {
  assert.equal(cityKey(" Tampa ", "fl"), "tampa|fl");
  assert.equal(cityKey("Tampa", null), null);
});

test("a rack to store leg is a loaded lane with its minutes and odometer miles", () => {
  const [leg] = extractLaneLegs(trip(), [], info);
  assert.equal(leg.kind, "loaded");
  assert.equal(leg.fromKey, "t:A");
  assert.equal(leg.toKey, "l:X");
  assert.equal(leg.minutes, 120);
  assert.equal(leg.miles, 90);
});

test("miles are dropped when the implied speed is impossible, and when an odometer is missing", () => {
  const fast = trip({ deliveries: [{ ...trip().deliveries[0], odometer: 1400 }] }); // 400 miles in 2 h
  assert.equal(extractLaneLegs(fast, [], info)[0].miles, null);
  const none = trip({ pickups: [{ ...trip().pickups[0], odometer: null }] });
  assert.equal(extractLaneLegs(none, [], info)[0].miles, null);
});

test("a fuel stop inside the leg means it is not counted", () => {
  const spans = [{ userId: "u", from: at("08:00"), to: at("08:30"), kind: "fuel" as const }];
  assert.equal(extractLaneLegs(trip(), spans, info).length, 0);
});

test("logged delay on the way is taken off the lane minutes", () => {
  const t = trip({ delays: [{ leg: "to_drop", deliveryId: "d1", minutes: 30, label: "Traffic" } as any] });
  assert.equal(extractLaneLegs(t, [], info)[0].minutes, 90);
});

test("the leg after a no-load rack is empty, after a loaded rack it is loaded", () => {
  const t = trip({ pickups: [{ ...trip().pickups[0], outcome: "no_load" }] });
  assert.equal(extractLaneLegs(t, [], info)[0].kind, "empty");
});

const stat = (level: "place" | "city", key: string, trips: number, meanMin: number): LaneStat => ({ level, key, kind: "loaded", trips, meanMin, sdMin: 5, miles: null, milesN: 0 });
const book = (rows: LaneStat[]): LaneBook => ({ stats: new Map(rows.map((r) => [statKey(r.level, r.kind, r.key), r])), cityOf: (k) => (k ? info(k).city : null) });

test("lookup prefers the exact place pair, then the city pair, and needs enough trips", () => {
  const cityLane = laneKey("tampa|fl", "orlando|fl");
  assert.deepEqual(lookupLane(book([stat("city", cityLane, 5, 100)]), "loaded_leg", "t:A", "l:X"), { minutes: 100, scope: "city", trips: 5 });
  assert.equal(lookupLane(book([stat("city", cityLane, 2, 100)]), "loaded_leg", "t:A", "l:X"), null);
  const both = book([stat("city", cityLane, 5, 100), stat("place", laneKey("t:A", "l:X"), 3, 80)]);
  assert.equal(lookupLane(both, "loaded_leg", "t:A", "l:X")?.scope, "place");
  assert.equal(lookupLane(both, "rack", "t:A", "l:X"), null);
});

test("the standard falls back to the shared lane estimate before the air-miles guess", () => {
  const std: Standards = { version: "v", rows: new Map(), visits: new Map(), lanes: book([stat("city", laneKey("tampa|fl", "orlando|fl"), 4, 110)]) };
  const seg = { type: "loaded_leg", key: "t:A>l:X", fromKey: "t:A", toKey: "l:X", hour: 8 } as Segment;
  const coords = () => ({ lat: 27, lon: -82 });
  const got = standardFor(seg, std, DEFAULT_RECAP_SETTINGS, coords, 0);
  assert.equal(got?.basis, "network");
  assert.equal(got?.minutes, 110);
  const none = standardFor(seg, { ...std, lanes: undefined }, DEFAULT_RECAP_SETTINGS, coords, 0);
  assert.equal(none?.basis, "distance");
});
