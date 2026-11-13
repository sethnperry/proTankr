import test from "node:test";
import assert from "node:assert/strict";
import { detectStops, drivesBetween } from "./trailStops.ts";
import { buildCatchUp, coveredShare, allocateOdometer } from "./catchUp.ts";

const iso = (m: number) => new Date(Date.UTC(2026, 10, 13, 12, 0) + m * 60_000).toISOString();
// ~0.0145 deg latitude is one mile.
const trail = [
  ...[0, 2, 4, 6, 8].map((m) => ({ lat: 27.0, lon: -82.0, at: iso(m) })),       // stopped at the store 0-8
  { lat: 27.05, lon: -82.0, at: iso(14) }, { lat: 27.1, lon: -82.0, at: iso(20) },
  ...[26, 30, 35, 40].map((m) => ({ lat: 27.15, lon: -82.0, at: iso(m) })),      // the shop 26-40
  { lat: 27.1, lon: -82.0, at: iso(46) },
  ...[52, 55, 60].map((m) => ({ lat: 27.0, lon: -82.0, at: iso(m) })),           // back at the store/yard
];

test("detects stops and the drives between them", () => {
  const stops = detectStops(trail);
  assert.equal(stops.length, 3);
  const drives = drivesBetween(trail, stops);
  assert.equal(drives.length, 2);
  assert.ok(drives[0].miles > 6 && drives[0].miles < 12);
});

test("catch-up asks about unaccounted drives and trailer drops, not covered ones", () => {
  const stops = detectStops(trail);
  const drives = drivesBetween(trail, stops);
  const places = [{ id: "shop", name: "Mike's Repair", lat: 27.15, lon: -82.0, kinds: ["maintenance"] }, { id: "s", name: "Loves 495", lat: 27.0, lon: -82.0, kinds: ["store"] }];
  const events = [{ type: "drop" as const, at: iso(32), trailerId: "t", trailerName: "3151", lat: 27.15, lon: -82.0 }];
  const cards = buildCatchUp({ drives, events, accounted: [{ from: iso(0), to: iso(8) }], places, trailerAtStart: true });
  const legs = cards.filter((c) => c.type === "leg");
  assert.equal(legs.length, 2);
  assert.equal(legs[0].type === "leg" && legs[0].suggested, "empty_return");
  assert.equal(legs[1].type === "leg" && legs[1].suggested, "bobtail"); // trailer dropped at 32
  const drop = cards.find((c) => c.type === "drop");
  assert.equal(drop && drop.type === "drop" && drop.suggested, "maintenance");
  // Everything accounted for: nothing to ask.
  assert.equal(buildCatchUp({ drives, events, accounted: [{ from: iso(0), to: iso(60) }], places, trailerAtStart: true }).length, 0);
});

test("covered share and odometer allocation", () => {
  assert.equal(coveredShare(0, 100, [{ from: new Date(0).toISOString(), to: new Date(50).toISOString() }]), 0.5);
  const a = allocateOdometer([{ id: "a", miles: 10 }, { id: "b", miles: 10 }], null, 1020);
  assert.deepEqual(a, { a: { begin: 1000, end: 1010 }, b: { begin: 1010, end: 1020 } });
});
