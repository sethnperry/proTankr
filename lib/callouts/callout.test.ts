import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "../trips/tripStore.ts";
import { blockText, buildCalloutEmail, calloutBlock, calloutProblem, canWithdraw, createCallout, editCallout, groupCallouts, resolveRoutes, routeLabel, routeProblem, shiftStartAt, withdrawCallout, type CalloutRoute } from "./callout.ts";

const TZ = "America/New_York";
const input = { reason: "Sick", reasonId: "r1", note: "", date: "2026-11-04", time: "06:00" };
const mk = (store = createTripStore({ storage: null, storageKey: "c" })) => ({ store, row: createCallout(store, { companyId: "c", driverId: "d", actorId: "d", input, category: "other", division: "DEF", region: "R1", localArea: "Tampa", tz: TZ, id: "00000000-0000-4000-8000-0000000000c1" }) });

test("a call-out needs a reason (Other needs words), a day and a start time", () => {
  assert.equal(calloutProblem(input), null);
  assert.match(calloutProblem({ ...input, reason: "" })!, /reason/);
  assert.match(calloutProblem({ ...input, reasonId: null, reason: "Other", note: " " })!, /reason/i);
  assert.match(calloutProblem({ ...input, date: "" })!, /day/);
  assert.match(calloutProblem({ ...input, time: "6" })!, /start/);
});

test("the shift start is the driver's local time, as a moment", () => {
  assert.equal(shiftStartAt("2026-11-04", "06:00", TZ), "2026-11-04T11:00:00.000Z");
});

test("the driver can withdraw until the shift starts; dispatch any time", () => {
  const { store, row } = mk();
  const before = Date.parse(row.shift_start_at) - 3600_000, after = Date.parse(row.shift_start_at) + 3600_000;
  assert.equal(canWithdraw(row, before, false), true);
  assert.equal(canWithdraw(row, after, false), false);
  assert.equal(canWithdraw(row, after, true), true);
  const w = withdrawCallout(store, row.callout_id, "disp", "2026-11-04T12:00:00Z")!;
  assert.equal(w.status, "withdrawn"); assert.equal(w.withdrawn_by, "disp");
  assert.equal(canWithdraw(w, before, true), false);
  assert.equal(store.list("callouts").length, 1, "withdrawing updates the same record");
});

test("editing keeps who made it and records who changed it", () => {
  const { store, row } = mk();
  const e = editCallout(store, row.callout_id, "disp", { ...input, date: "2026-11-05", time: "07:30" }, "other", TZ)!;
  assert.equal(e.created_by, "d"); assert.equal(e.updated_by, "disp"); assert.equal(e.shift_date, "2026-11-05");
  assert.equal(createCallout(store, { companyId: "c", driverId: "d", actorId: "d", input, category: null, division: null, region: null, localArea: null, tz: TZ, id: row.callout_id }).shift_date, "2026-11-05", "a retried create is the same record");
});

test("routing: the most specific match wins, by kind; the company default is the fallback", () => {
  const r = (kind: "dispatch" | "manager", email: string, region: string | null = null, local_area: string | null = null, division: string | null = null): CalloutRoute => ({ route_id: email, kind, email, region, local_area, division });
  const routes = [r("dispatch", "all@x.com"), r("dispatch", "r1@x.com", "R1"), r("dispatch", "def@x.com", null, null, "DEF"), r("dispatch", "r1def@x.com", "R1", null, "DEF"), r("manager", "boss@x.com"), r("manager", "R1boss@x.com", "R1")];
  assert.deepEqual(resolveRoutes(routes, { region: "R1", localArea: "Tampa", division: "DEF" }), { dispatch: ["r1def@x.com"], manager: ["R1boss@x.com"] });
  assert.deepEqual(resolveRoutes(routes, { region: "R1", localArea: null, division: null }), { dispatch: ["r1@x.com"], manager: ["R1boss@x.com"] });
  assert.deepEqual(resolveRoutes(routes, { region: "R2", localArea: null, division: "def" }), { dispatch: ["def@x.com"], manager: ["boss@x.com"] });
  assert.deepEqual(resolveRoutes(routes, { region: "R2", localArea: null, division: null }), { dispatch: ["all@x.com"], manager: ["boss@x.com"] });
  assert.deepEqual(resolveRoutes([r("dispatch", "a@x.com"), r("dispatch", "A@x.com")], { region: null, localArea: null, division: null }).dispatch, ["a@x.com"]);
  assert.equal(routeLabel({ region: null, local_area: null, division: null }), "Company default");
  assert.match(routeProblem("nope")!, /valid/);
});

test("an active call-out blocks that driver's plan on that day, until it is withdrawn", () => {
  const { store, row } = mk();
  const startMs = Date.parse("2026-11-04T15:00:00Z"); // 10am local on the 4th
  assert.equal(calloutBlock(store.list("callouts"), "d", startMs, TZ)?.callout_id, row.callout_id);
  assert.equal(calloutBlock(store.list("callouts"), "other", startMs, TZ), null);
  assert.equal(calloutBlock(store.list("callouts"), "d", Date.parse("2026-11-05T15:00:00Z"), TZ), null);
  assert.match(blockText(row, "Seth Perry"), /Seth Perry called out for 11\/4 \(Sick\)/);
  withdrawCallout(store, row.callout_id, "d", "2026-11-03T20:00:00Z");
  assert.equal(calloutBlock(store.list("callouts"), "d", startMs, TZ), null);
});

test("emails: a call-out by dispatch is marked as corrected and says who entered it", () => {
  const { row } = mk();
  const a = buildCalloutEmail({ event: "created", callout: row, driverName: "Seth <Perry>", actorName: "Seth", byDispatch: false, tz: TZ });
  assert.match(a.subject, /^Call-out: Seth <Perry>, 11\/4 6:00 AM$/);
  assert.ok(a.html.includes("Seth &lt;Perry&gt;"));
  const b = buildCalloutEmail({ event: "withdrawn", callout: row, driverName: "Seth", actorName: "Dana", byDispatch: true, tz: TZ });
  assert.match(b.subject, /^Call-out corrected: withdrawn/);
  assert.ok(b.text.includes("Entered by: Dana (dispatch)"));
});

test("lists: upcoming active first, soonest first; everything else after", () => {
  const { store, row } = mk();
  const w = createCallout(store, { companyId: "c", driverId: "d2", actorId: "d2", input: { ...input, date: "2026-11-03" }, category: null, division: null, region: null, localArea: null, tz: TZ, id: "00000000-0000-4000-8000-0000000000c2" });
  withdrawCallout(store, w.callout_id, "d2", "2026-11-02T00:00:00Z");
  const g = groupCallouts(store.list("callouts"), Date.parse("2026-11-03T15:00:00Z"), TZ);
  assert.deepEqual(g.upcoming.map((c) => c.callout_id), [row.callout_id]);
  assert.deepEqual(g.past.map((c) => c.callout_id), [w.callout_id]);
});
