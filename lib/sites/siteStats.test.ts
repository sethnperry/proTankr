import test from "node:test";
import assert from "node:assert/strict";
import { averageMinutes } from "./siteStats.ts";

const v = (a: number, b: number) => ({ arrivedAt: new Date(a * 60_000).toISOString(), leftAt: new Date(b * 60_000).toISOString() });
test("averages visits, needs three, ignores broken or forgotten ones", () => {
  assert.equal(averageMinutes([v(0, 30), v(0, 40)]), null);
  assert.equal(averageMinutes([v(0, 30), v(0, 40), v(0, 50)]), 40);
  assert.equal(averageMinutes([v(0, 30), v(0, 40), v(0, 50), v(0, 900), v(10, 10), { arrivedAt: null, leftAt: null }]), 40);
});
