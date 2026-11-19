import test from "node:test";
import assert from "node:assert/strict";
import { dispatchedPlanFor } from "../components/trip/dispatchedPlan.ts";

const cat = [{ product_id: "d2", product_name: "ULSD Diesel #2", display_name: "D2", button_code: "D2", hex_code: "#eab308" }];
const color = () => "#fff";

test("dispatch's compartment plan is shown, highest compartment first", () => {
  const r = dispatchedPlanFor([{ planned_comps: [{ comp_number: 1, product_id: "d2" }, { comp_number: 3, product_id: "d2" }] }], null, cat, color);
  assert.deepEqual(r.comps.map((c) => [c.num, c.code]), [[3, "D2"], [1, "D2"]]);
});
test("the plan the driver picked on Begin Trip stands in when dispatch gave none", () => {
  const r = dispatchedPlanFor([{ planned_comps: null }], { slot: 1, snapshot: { comps: ["d2", null, "d2"] } }, cat, color);
  assert.equal(r.letter, "A");
  assert.deepEqual(r.comps.map((c) => [c.num, c.code]), [[3, "D2"], [2, null], [1, "D2"]]);
});
test("only a plan letter is known: say so; nothing known: the trailer isn't set. Never Bobtail", () => {
  assert.equal(dispatchedPlanFor([], { slot: 2, snapshot: null }, cat, color).word, "Plan B");
  assert.equal(dispatchedPlanFor([], null, cat, color).word, "Trailer not set");
});

test("a truck planned with no trailer is a real bobtail", () => {
  assert.equal(dispatchedPlanFor([], null, cat, color, { truck: true, trailer: false }).word, "Bobtail");
  assert.equal(dispatchedPlanFor([], null, cat, color, { truck: false, trailer: false }).word, "Trailer not set");
});
