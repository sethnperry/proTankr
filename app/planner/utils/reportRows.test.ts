import test from "node:test";
import assert from "node:assert/strict";
import { reportRows } from "./reportRows.ts";

test("planned products are used when there are any", () => {
  const rows = [{ productId: "d2", planned_gallons: 4000 }];
  assert.equal(reportRows(rows, {}, [{ product_id: "x" }]), rows);
});
test("an empty plan falls back to the plan's own products, then the terminal's", () => {
  assert.deepEqual(reportRows([], { 1: { productId: "d2" }, 2: { empty: true } }, [{ product_id: "x" }]).map((r) => r.productId), ["d2"]);
  assert.deepEqual(reportRows([], {}, [{ product_id: "x" }, { product_id: "y", active: false }]).map((r) => r.productId), ["x"]);
});
