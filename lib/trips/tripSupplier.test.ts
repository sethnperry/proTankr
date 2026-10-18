import { test } from "node:test";
import assert from "node:assert/strict";
import { sameSupplier, tripSupplierPicks } from "./tripSupplier.ts";
import { ANY_PRODUCT, resolvePicks } from "../suppliers/picks.ts";

test("trip supplier presets every planned product", () => {
  const picks = tripSupplierPicks({ supplier_id: "s1", name: "Atlas - MO" });
  assert.deepEqual(picks, [{ product_id: ANY_PRODUCT, supplier_id: "s1", name: "Atlas - MO" }]);
  assert.deepEqual(resolvePicks(picks, ["d2", "87"]).map((p) => [p.product_id, p.name]), [["d2", "Atlas - MO"], ["87", "Atlas - MO"]]);
});

test("sameSupplier compares by id, else by name", () => {
  assert.equal(sameSupplier({ supplier_id: "a", name: "X" }, { supplier_id: "a", name: "Y" }), true);
  assert.equal(sameSupplier({ supplier_id: null, name: "Atlas " }, { supplier_id: null, name: "atlas" }), true);
  assert.equal(sameSupplier({ supplier_id: "a", name: "X" }, null), false);
});
