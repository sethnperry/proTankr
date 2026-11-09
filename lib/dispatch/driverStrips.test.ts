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

import { byUrgency, renewalCount } from "./driverStrips.ts";
test("strips order by soonest expiry; renewal count covers expired and 7 days or fewer", () => {
  const cat = [
    { terminal_id: "1", terminal_name: "Marathon", city: "Tampa", state: "FL", renewal_days: 90 },
    { terminal_id: "2", terminal_name: "Chevron", city: "Fort Lauderdale", state: "FL", renewal_days: 90 },
  ];
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const strips = driverCityStrips([{ terminal_id: "1", carded_on: day(10) }, { terminal_id: "2", carded_on: day(86) }], cat, new Date().toISOString().slice(0, 10));
  assert.equal(byUrgency(strips)[0].place, "Fort Lauderdale, FL");
  assert.equal(renewalCount(strips).count, 1);
});
