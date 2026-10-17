import test from "node:test";
import assert from "node:assert/strict";
import { applyPick, groupPicks, unpickedProducts } from "./picks.ts";

const atlas = { supplier_id: "s1", name: "Atlas - MO" };
const sun = { supplier_id: "s2", name: "Sunoco" };

test("picks: one pick covers every planned product by default", () => {
  const p = applyPick([], ["d2", "87"], atlas);
  assert.deepEqual(p.map((x) => [x.product_id, x.name]), [["d2", "Atlas - MO"], ["87", "Atlas - MO"]]);
  assert.deepEqual(unpickedProducts(p, ["d2", "87"]), []);
});

test("picks: switching one product keeps the other, groups by supplier", () => {
  const p = applyPick(applyPick([], ["d2", "87"], atlas), ["d2", "87"], sun, ["87"]);
  assert.deepEqual(groupPicks(p).map((g) => [g.name, g.productIds]), [["Atlas - MO", ["d2"]], ["Sunoco", ["87"]]]);
});

test("picks: a product dropped from the plan drops its pick; a new one is unpicked", () => {
  const p = applyPick(applyPick([], ["d2", "87"], atlas), ["d2", "93"], sun, []);
  assert.deepEqual(p.map((x) => x.product_id), ["d2"]);
  assert.deepEqual(unpickedProducts(p, ["d2", "93"]), ["93"]);
});

test("picks: a supplier picked before any product carries to products planned later", async () => {
  const { resolvePicks, ANY_PRODUCT } = await import("./picks.ts");
  const stored = applyPick([], [ANY_PRODUCT], atlas);
  assert.deepEqual(resolvePicks(stored, []).map((p) => p.product_id), [ANY_PRODUCT]);
  assert.deepEqual(resolvePicks(stored, ["d2", "87"]).map((p) => [p.product_id, p.name]), [["d2", "Atlas - MO"], ["87", "Atlas - MO"]]);
  const changed = applyPick(resolvePicks(stored, ["d2", "87"]), ["d2", "87"], sun, ["87"]);
  assert.deepEqual(resolvePicks(changed, ["d2", "87"]).map((p) => p.name), ["Atlas - MO", "Sunoco"]);
});
