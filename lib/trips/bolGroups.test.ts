import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBolGroups, distributeWhole, initialBolAssignment } from "./bolGroups.ts";

const lines = [
  { comp: 3, productId: "d2", gallons: 3000 },
  { comp: 2, productId: "87", gallons: 2000 },
  { comp: 1, productId: "d2", gallons: 3800 },
];

test("one window per product, in walk order, until split", () => {
  const g = buildBolGroups(lines, {});
  assert.deepEqual(g.map((x) => [x.productId, x.comps, x.bolIndex, x.bolCount]), [
    ["d2", [3, 1], 1, 1],
    ["87", [2], 1, 1],
  ]);
  assert.equal(g[0].plannedGallons, 6800);
});

test("split load gives each BOL its own window, renumbered", () => {
  const g = buildBolGroups(lines, { 1: 3 });
  assert.deepEqual(g.map((x) => [x.productId, x.comps, x.bolIndex, x.bolCount]), [
    ["d2", [3], 1, 2],
    ["d2", [1], 2, 2],
    ["87", [2], 1, 1],
  ]);
});

test("editing a load starts from the BOLs already recorded", () => {
  const a = initialBolAssignment(lines, { 3: "A1", 1: "b2", 2: "A1" });
  assert.deepEqual(a, { 3: 1, 2: 1, 1: 2 });
  assert.deepEqual(initialBolAssignment(lines, {}), { 3: 1, 2: 1, 1: 1 });
});

test("gross spread by planned gallons sums exactly", () => {
  assert.deepEqual(distributeWhole(6801, [3000, 3800]), [3000, 3801]);
  const d = distributeWhole(1000, [1, 1, 1]);
  assert.equal(d.reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(d, [334, 333, 333]);
  assert.deepEqual(distributeWhole(10, [0, 0]), [5, 5]);
  assert.deepEqual(distributeWhole(7000.4, [1]), [7000]);
  assert.deepEqual(distributeWhole(5, []), []);
});

import { allocateBolGallons } from "./bolGroups.ts";

test("allocateBolGallons: capped compartments load to their cap, the flex compartment takes the difference (the 11/19 load)", () => {
  // C1 and C2 planned at the driver's caps, C3 the flex compartment (safety cap 3800).
  const out = allocateBolGallons(8884, [{ planned: 4300, cap: 4300 }, { planned: 1250, cap: 1250 }, { planned: 3087.96, cap: 3800 }]);
  assert.deepEqual(out, [4300, 1250, 3334]);
});

test("allocateBolGallons: the total is never refused and always sums exactly", () => {
  const comps = [{ planned: 4300, cap: 4300 }, { planned: 1250, cap: 1250 }, { planned: 3087.96, cap: 3800 }];
  for (const t of [0, 1, 5000, 5550, 5551, 8638, 9500, 20000]) assert.equal(allocateBolGallons(t, comps).reduce((a, b) => a + b, 0), t);
});

test("allocateBolGallons: everything capped spreads by plan (an all-capped load never blocks the BOL)", () => {
  const out = allocateBolGallons(9000, [{ planned: 4300, cap: 4300 }, { planned: 1250, cap: 1250 }, { planned: 3800, cap: 3800 }]);
  assert.equal(out.reduce((a, b) => a + b, 0), 9000);
  assert.ok(out[0] > out[1] && out[2] > out[1]);
});

test("allocateBolGallons: a BOL smaller than the capped compartments alone falls back to the plan's proportions", () => {
  const out = allocateBolGallons(4000, [{ planned: 4300, cap: 4300 }, { planned: 1250, cap: 1250 }, { planned: 3087.96, cap: 3800 }]);
  assert.equal(out.reduce((a, b) => a + b, 0), 4000);
  assert.ok(out.every((n) => n >= 0));
});

test("allocateBolGallons: nothing capped is the old behavior (spread by plan); two flex compartments share the difference by plan", () => {
  assert.deepEqual(allocateBolGallons(1000, [{ planned: 500, cap: null }, { planned: 500, cap: null }]), [500, 500]);
  const out = allocateBolGallons(5000, [{ planned: 2000, cap: 2000 }, { planned: 1000, cap: 3000 }, { planned: 2000, cap: 3000 }]);
  assert.deepEqual(out, [2000, 1000, 2000]);
  const big = allocateBolGallons(6000, [{ planned: 2000, cap: 2000 }, { planned: 1000, cap: 3000 }, { planned: 2000, cap: 3000 }]);
  assert.deepEqual(big, [2000, 1333, 2667]);
});
