import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBySubject, planAlerts, planCounts, type PlanInputs } from "./planAlerts.ts";

const base = (): PlanInputs => ({
  names: new Map([["u1", "Ann"], ["u2", "Bob"]]),
  access: [], terminals: new Map([["T1", { name: "Marathon", renewal_days: 90 }]]),
  credentials: [], badges: [], permits: [],
  trucks: new Map([["k1", "25184"]]), trailers: new Map([["r1", "3151"]]),
});
const TODAY = "2026-10-19";

test("access: expiry is carded_on + renewal days; timed-out access is dropped", () => {
  const i = base();
  i.access = [
    { user_id: "u1", terminal_id: "T1", carded_on: "2026-07-25" }, // expires 10-23, 4 days
    { user_id: "u2", terminal_id: "T1", carded_on: "2026-06-01" }, // expired 08-30, 50 days ago -> no access
    { user_id: "u2", terminal_id: "T1", carded_on: "2026-10-01" }, // expires 12-30, outside 30 days
    { user_id: "ghost", terminal_id: "T1", carded_on: "2026-07-25" }, // not on the roster
  ];
  const a = planAlerts(i, 30, TODAY);
  assert.deepEqual(a.map((x) => [x.subject, x.label, x.days, x.state]), [["Ann", "Marathon access", 4, "expiring"]]);
});

test("credentials, badges, permits; equipment off the active list is skipped; sorted worst first", () => {
  const i = base();
  i.credentials = [{ user_id: "u2", kind: "medical", expiration_date: "2026-10-10" }];
  i.badges = [{ user_id: "u1", port_name: "Port Everglades", expiration_date: "2026-11-10" }];
  i.permits = [
    { truck_id: "k1", trailer_id: null, expiration_date: "2026-10-30", permit_name: "Registration" },
    { truck_id: "gone", trailer_id: null, expiration_date: "2026-10-20", permit_name: "IFTA" },
  ];
  const a = planAlerts(i, 30, TODAY);
  assert.deepEqual(a.map((x) => [x.subject, x.label, x.state]), [
    ["Bob", "Medical card", "expired"],
    ["Truck 25184", "Registration", "soon"],
    ["Ann", "Port Everglades badge", "soon"],
  ]);
  const c = planCounts(a);
  assert.deepEqual(c, { expired: 1, week: 0, month: 2, driversAffected: 2, unitsAffected: 1 });
  assert.deepEqual(groupBySubject(a).map((g) => g.subject), ["Bob", "Truck 25184", "Ann"]);
  assert.equal(planAlerts(i, 7, TODAY).length, 1);
});
