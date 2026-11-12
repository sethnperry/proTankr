import test from "node:test";
import assert from "node:assert/strict";
import { ageText, deskScope, groupErrors, retryTarget, stuckList, timeline, visibleErrors, type ErrorRow } from "./desk.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const E = (o: Partial<ErrorRow>): ErrorRow => ({ error_id: "e1", company_id: "c", user_id: "u1", kind: "send_failed", message: "Call-out email failed", payload: {}, created_at: "2026-11-02T11:00:00Z", resolved_at: null, ...o });
const name = (id: string) => ({ u1: "Sam", u2: "Amy" } as Record<string, string>)[id] ?? "Driver";

test("ages read in minutes, hours, then days", () => {
  assert.equal(ageText("2026-11-02T11:55:00Z", NOW), "5m");
  assert.equal(ageText("2026-11-02T06:00:00Z", NOW), "6h");
  assert.equal(ageText("2026-10-29T12:00:00Z", NOW), "4d");
});

test("admin sees their company, super admin every company, dispatch only their region and read only, drivers nothing", () => {
  assert.deepEqual(deskScope("admin", false), { allCompanies: false, ownRegionOnly: false, canResolve: true, canUseAs: true });
  assert.equal(deskScope("driver", true)?.allCompanies, true);
  const d = deskScope("dispatch", false)!;
  assert.equal(d.canResolve, false); assert.equal(d.canUseAs, false); assert.equal(d.ownRegionOnly, true);
  assert.equal(deskScope("driver", false), null);
  assert.equal(deskScope("lead", false), null);
});

test("dispatch sees only drivers in their own region; no region means nothing", () => {
  const rows = [E({ error_id: "a", user_id: "u1" }), E({ error_id: "b", user_id: "u2" }), E({ error_id: "c", user_id: null })];
  const region = (id: string) => (id === "u1" ? "South" : "North");
  const scope = deskScope("dispatch", false)!;
  assert.deepEqual(visibleErrors(rows, scope, " south", region).map((r) => r.error_id), ["a"]);
  assert.equal(visibleErrors(rows, scope, null, region).length, 0);
  assert.equal(visibleErrors(rows, deskScope("admin", false)!, null, region).length, 3);
});

test("the inbox groups open entries by kind then driver, newest first, and drops resolved ones", () => {
  const rows = [
    E({ error_id: "1", created_at: "2026-11-02T10:00:00Z" }),
    E({ error_id: "2", created_at: "2026-11-02T11:30:00Z", user_id: "u2" }),
    E({ error_id: "3", kind: "telematics_link", created_at: "2026-11-02T11:59:00Z", message: "Geotab reading failed" }),
    E({ error_id: "4", resolved_at: "2026-11-02T11:00:00Z" }),
  ];
  const g = groupErrors(rows, name, NOW);
  assert.deepEqual(g.map((x) => x.kind), ["telematics_link", "send_failed"]);
  assert.equal(g[1].count, 2);
  assert.deepEqual(g[1].drivers.map((d) => d.name), ["Amy", "Sam"]);
  assert.equal(g[0].drivers[0].items[0].age, "1m");
  assert.equal(groupErrors([E({ user_id: null })], name, NOW)[0].drivers[0].name, "Company");
});

test("only a failed call-out email can be retried from here", () => {
  assert.deepEqual(retryTarget({ kind: "send_failed", payload: { callout_id: "x", event: "withdrawn" } }), { type: "callout", calloutId: "x", event: "withdrawn" });
  assert.deepEqual(retryTarget({ kind: "send_failed", payload: { callout_id: "x" } }), { type: "callout", calloutId: "x", event: "created" });
  assert.equal(retryTarget({ kind: "send_failed", payload: { work_order_id: "w" } }), null);
  assert.equal(retryTarget({ kind: "telematics_link", payload: { callout_id: "x" } }), null);
  assert.deepEqual(retryTarget({ kind: "sync_stuck", payload: {}, user_id: "u1" }), { type: "sync", userId: "u1" });
  assert.equal(retryTarget({ kind: "sync_stuck", payload: {} }), null);
});

test("the stuck-sync list keeps each driver's newest open report", () => {
  const rows = [
    E({ error_id: "1", kind: "sync_stuck", payload: { count: 2, failed: 0, tables: ["trips"], oldestAt: "2026-11-02T09:00:00Z" }, created_at: "2026-11-02T09:30:00Z" }),
    E({ error_id: "2", kind: "sync_stuck", payload: { count: 5, failed: 1, tables: ["trips", "trip_events"], oldestAt: "2026-11-02T08:00:00Z", lastError: "23503" }, created_at: "2026-11-02T11:00:00Z" }),
    E({ error_id: "3", kind: "sync_stuck", user_id: "u2", payload: { count: 1 }, created_at: "2026-11-02T10:00:00Z", resolved_at: "2026-11-02T10:30:00Z" }),
  ];
  const l = stuckList(rows, name, NOW);
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].name, l[0].count, l[0].failed, l[0].oldestAge, l[0].lastError], ["Sam", 5, 1, "4h", "23503"]);
});

test("a timeline merges trips, shift events and forms, newest first, each with its source", () => {
  const t = timeline({
    trips: [{ trip_id: "t", status: "complete", started_at: "2026-11-02T08:00:00Z", completed_at: "2026-11-02T14:00:00Z", order: "4816" }],
    shifts: [{ event_id: "s", event_type: "shift_start", occurred_at: "2026-11-02T07:30:00Z", source: "geotab" }, { event_id: "x", event_type: "safety_meeting", occurred_at: "2026-11-02T07:00:00Z", source: "weird" }],
    captures: [{ capture_id: "c", purpose: "fuel_receipt", created_at: "2026-11-02T10:00:00Z", source: "app" }],
    forms: [{ key: "f", at: "2026-11-02T09:00:00Z", title: "Call-out", source: "manual" }],
  });
  assert.deepEqual(t.map((x) => x.title), ["Trip complete", "Fuel receipt", "Call-out", "Trip began", "Shift started", "Safety meeting signed"]);
  assert.equal(t.find((x) => x.title === "Shift started")?.source, "geotab");
  assert.equal(t.find((x) => x.title === "Safety meeting signed")?.source, "app");
  assert.equal(t[0].detail, "Order 4816");
});
