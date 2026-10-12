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
