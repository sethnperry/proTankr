import { test } from "node:test";
import assert from "node:assert/strict";
import { driverCityStrips } from "./driverStrips.ts";

const cat = [
  { terminal_id: 1, terminal_name: "Shell", city: "Tampa", state: "FL" },
  { terminal_id: 2, terminal_name: "BP", city: "Tampa", state: "FL" },
  { terminal_id: 3, terminal_name: "Citgo", city: "Miami", state: "FL" },
  { terminal_id: 4, terminal_name: "Gulf", city: "Jax", state: "FL" },
];
test("one strip per carded city, listing every terminal there", () => {
  const s = driverCityStrips([{ terminal_id: "1", carded_on: "2026-11-01" }, { terminal_id: "3", carded_on: "2026-11-01" }], cat, "2026-11-08");
  assert.deepEqual(s.map((x) => x.place), ["Miami, FL", "Tampa, FL"]);
  assert.equal(s[1].summary.segments.length, 2);
  assert.equal(s[1].summary.access, 1);
});
test("never carded anywhere gives no strips", () => assert.equal(driverCityStrips([], cat, "2026-11-08").length, 0));
