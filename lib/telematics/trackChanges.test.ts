import test from "node:test";
import assert from "node:assert/strict";
import { buildChanges } from "./trackChanges.ts";

const base = { truckName: "25184", place: "Tampa, FL", storedPlace: null, hasPosition: true, hookKnown: true, observedTrailerId: "t1", observedTrailerName: "3151", ourTrailerId: "t1", ourTrailerName: "3151", driverName: "Seth Perry", claimedByName: "Seth Perry" };

test("buildChanges: same pairing and driver is only a location update", () => {
  const c = buildChanges(base);
  assert.deepEqual(c.map((x) => x.kind), ["location"]);
  assert.match(c[0].text, /Tampa, FL/);
});

test("buildChanges: a different trailer is reported and would separate the old pair", () => {
  const c = buildChanges({ ...base, observedTrailerId: "t2", observedTrailerName: "370" });
  const h = c.find((x) => x.kind === "hookup")!;
  assert.equal(h.separates, true);
  assert.match(h.text, /pulling trailer 370.*3151/);
});

test("buildChanges: no trailer hooked, unknown tracking, and driver mismatch", () => {
  assert.equal(buildChanges({ ...base, observedTrailerId: null }).find((x) => x.kind === "hookup")!.separates, true);
  assert.equal(buildChanges({ ...base, hookKnown: false, observedTrailerId: null }).some((x) => x.kind === "hookup"), false);
  assert.equal(buildChanges({ ...base, observedTrailerId: null, ourTrailerId: null, ourTrailerName: null }).some((x) => x.kind === "hookup"), false);
  assert.match(buildChanges({ ...base, driverName: "Pedro", claimedByName: "Seth Perry" }).find((x) => x.kind === "driver")!.text, /Pedro.*Seth/);
  assert.match(buildChanges({ ...base, storedPlace: "Ocala, FL" })[0].text, /was Ocala/);
});
