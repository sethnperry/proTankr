import test from "node:test";
import assert from "node:assert/strict";
import { deadlinedUnits, proposalFor, proposalKey, type GeoMine, type GeoUnit } from "./geotabMatch.ts";

const u = (id: string, status: string | null = null): GeoUnit => ({ id, name: id, status, notes: null, subStatus: null, statusAt: null, location: null, deadlinedBy: null, resume: null });
const geo = (o: Partial<GeoMine>): GeoMine => ({ linked: true, signedIn: true, role: "driver", truck: u("T"), trailers: [], trailerKnown: true, ...o });
const none = { truckId: null, trailerId: null, secondSeatTruckId: null };

test("nothing to offer when Geotab has nothing or isn't linked", () => {
  assert.equal(proposalFor(null, none), null);
  assert.equal(proposalFor({ linked: false }, none), null);
  assert.equal(proposalFor(geo({ signedIn: false }), none), null);
});
test("signed in to a truck you don't hold: link it, bobtail when no trailer", () => {
  const p = proposalFor(geo({}), none);
  assert.equal(p?.kind, "link");
  assert.equal(p && "trailer" in p ? p.trailer : "x", null);
});
test("hooked trailer comes with the link; later hook couples", () => {
  assert.equal(proposalFor(geo({ trailers: [u("R")] }), none) && (proposalFor(geo({ trailers: [u("R")] }), none) as any).trailer.id, "R");
  assert.equal(proposalFor(geo({ trailers: [u("R")] }), { ...none, truckId: "T" })?.kind, "couple");
});
test("no trailer in Geotab while holding a pair: bobtail, but only if Geotab reports trailers at all", () => {
  assert.equal(proposalFor(geo({}), { ...none, truckId: "T", trailerId: "R" })?.kind, "bobtail");
  assert.equal(proposalFor(geo({ trailerKnown: false }), { ...none, truckId: "T", trailerId: "R" }), null);
});
test("a deadlined truck you already hold still asks", () => {
  assert.equal(proposalFor(geo({ truck: u("T", "deadline") }), { ...none, truckId: "T" })?.kind, "deadline_check");
});
test("second seat and promotion", () => {
  assert.equal(proposalFor(geo({ role: "second" }), none)?.kind, "second_seat");
  assert.equal(proposalFor(geo({ role: "second" }), { ...none, secondSeatTruckId: "T" }), null);
  assert.equal(proposalFor(geo({ role: "driver" }), { ...none, secondSeatTruckId: "T" })?.kind, "promote");
});
test("deadlined units and the snooze key", () => {
  const p = proposalFor(geo({ truck: u("T", "deadline"), trailers: [u("R", "deadline")] }), none)!;
  assert.deepEqual(deadlinedUnits(p).map((d) => d.kind), ["truck", "trailer"]);
  assert.notEqual(proposalKey(p), proposalKey(proposalFor(geo({ truck: u("T") }), none)!));
});
