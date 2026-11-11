import test from "node:test";
import assert from "node:assert/strict";
import { mergeBlendRows, topOffPlan } from "./splash.ts";

const row = (id: string, comp: number, p: string, g: number) => ({ compartment_load_id: id, comp_number: comp, product_id: p, gross_gallons: g, bio_blend: null as string | null });

test("two loads in a compartment become one E10 compartment", () => {
  const { rows, hidden } = mergeBlendRows([row("a", 1, "87", 1800), row("b", 1, "eth", 200), row("c", 2, "87", 2000)], { 1: "eth" });
  assert.equal(rows.length, 2);
  const c1 = rows.find((r) => r.comp_number === 1)!;
  assert.equal(c1.gross_gallons, 2000);
  assert.equal(c1.bio_blend, "E10");
  assert.equal(c1.product_id, "87");
  assert.deepEqual(hidden[c1.compartment_load_id], ["b"]);
  assert.equal(rows.find((r) => r.comp_number === 2)!.bio_blend, null);
});

test("order of loading doesn't change the result", () => {
  const { rows } = mergeBlendRows([row("b", 1, "eth", 300), row("a", 1, "87", 1700)], { 1: "eth" });
  assert.equal(rows[0].bio_blend, "E15");
});

test("weight room is handed out comp by comp", () => {
  const plan = topOffPlan(
    [1, 2].map((n) => ({ n, aboardProductId: "87", aboardGallons: 1800, max: 2000, pct: 10, additiveProductId: "eth", topProductId: "eth" })),
    1000, () => 6.7,
  );
  assert.equal(plan.get(1)!.add, 149);
  assert.equal(plan.get(1)!.limitedBy, "weight");
  assert.equal(plan.get(2)!.add, 0);
});
