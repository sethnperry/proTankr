import test from "node:test";
import assert from "node:assert/strict";
import { tankAccepts } from "./tankCompat.ts";

const e15 = { name: "Unleaded E15 ~88", code: "E15" };
const reg = { name: "Regular Unleaded E10 87", code: "87" };
const prem = { name: "Premium Unleaded 93", code: "93" };
const d2 = { name: "ULSD Diesel #2", code: "D2" };

test("E15 goes into a regular tank", () => assert.equal(tankAccepts(e15, reg), true));
test("not the other way, and not into premium or diesel", () => {
  assert.equal(tankAccepts(reg, e15), false);
  assert.equal(tankAccepts(e15, prem), false);
  assert.equal(tankAccepts(e15, d2), false);
});
test("missing products are never accepted", () => assert.equal(tankAccepts(null, reg), false));
