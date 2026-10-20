import test from "node:test";
import assert from "node:assert/strict";
import { conflictPairs, diffNew, notificationBody } from "./conflictAlerts.ts";
import { applyAcks, type Ack } from "./acks.ts";
import { watchList } from "./watch.ts";
import { planAlerts, accessGaps, type PlanInputs } from "./planAlerts.ts";
import { serviceAlerts } from "./serviceAlerts.ts";
import type { Conflict, ActiveReport } from "./conflicts.ts";

const rep = (id: string, terminalId: string, createdAt = "2026-10-19T10:00:00Z"): ActiveReport =>
  ({ reportId: id, terminalId, type: "long_line", productId: null, supplierName: null, createdAt });
const conflict = (terminalId: string, reports: ActiveReport[], tripIds: string[]): Conflict => ({
  terminalId, reports, severity: "hit", newestAt: reports[0].createdAt,
  trucks: tripIds.map((t) => ({ tripId: t, driverName: "D", truckName: "1", arrived: false, severity: "hit" as const, reportIds: reports.map((r) => r.reportId) })),
});

test("conflict pairs and diff: only unseen pairs are new", () => {
  const c = [conflict("T1", [rep("r1", "T1")], ["a", "b"])];
  assert.deepEqual(conflictPairs(c).sort(), ["T1|a|r1", "T1|b|r1"]);
  const known = new Set(["T1|a|r1"]);
  const d = diffNew(known, c);
  assert.deepEqual(d.fresh, ["T1|b|r1"]);
  assert.deepEqual([...d.terminalIds], ["T1"]);
  assert.equal(diffNew(new Set(conflictPairs(c)), c).fresh.length, 0);
});

test("a new report on a known truck is new", () => {
  const before = [conflict("T1", [rep("r1", "T1")], ["a"])];
  const after = [conflict("T1", [rep("r2", "T1"), rep("r1", "T1")], ["a"])];
  assert.deepEqual(diffNew(new Set(conflictPairs(before)), after).fresh, ["T1|a|r2"]);
});

test("notification body names terminal, reports and truck count", () => {
  const c = [conflict("T1", [rep("r1", "T1")], ["a", "b"])];
  const n = notificationBody(c, conflictPairs(c), () => "Marathon", () => "Long line");
  assert.equal(n.title, "New conflict");
  assert.equal(n.body, "Marathon: Long line (2 trucks)");
});

test("acks: handled only when every report is acked; handled sink to the bottom", () => {
  const c1 = conflict("T1", [rep("r1", "T1"), rep("r2", "T1")], ["a"]);
  const c2 = conflict("T2", [rep("r3", "T2")], ["b"]);
  const acks = new Map<string, Ack>([
    ["r1", { reportId: "r1", by: "Dana", at: "2026-10-19T11:00:00Z", note: "rerouted" }],
    ["r3", { reportId: "r3", by: "Dana", at: "2026-10-19T11:05:00Z", note: null }],
  ]);
  const out = applyAcks([c1, c2], acks);
  assert.equal(out[0].terminalId, "T1");
  assert.equal(out[0].handled, null); // r2 not acked
  assert.equal(out[1].handled?.by, "Dana");
  acks.set("r2", { reportId: "r2", by: "Sam", at: "2026-10-19T12:00:00Z", note: null });
  const again = applyAcks([c1, c2], acks);
  const t1 = again.find((c) => c.terminalId === "T1")!;
  assert.equal(t1.handled?.by, "Sam");
  assert.equal(t1.handled?.note, "rerouted"); // note kept from the earlier ack
});

test("watch list: only terminals no truck is headed to, newest first", () => {
  const rs = [rep("r1", "T1", "2026-10-19T09:00:00Z"), rep("r2", "T2", "2026-10-19T10:00:00Z"), rep("r3", "T3", "2026-10-19T08:00:00Z")];
  const w = watchList(rs, new Set(["T3"]));
  assert.deepEqual(w.map((x) => x.terminalId), ["T2", "T1"]);
});

const baseInput = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  names: new Map([["u1", "Ann"]]), access: [], terminals: new Map([["T1", { name: "Marathon", renewal_days: 90 }]]),
  credentials: [], badges: [], permits: [], trucks: new Map(), trailers: new Map(), ...over,
});
const loads = (n: number, u = "u1", t = "T1") => Array.from({ length: n }, () => ({ user_id: u, terminal_id: t }));

test("access gaps: 3+ loads and never carded", () => {
  const g = accessGaps(baseInput({ loads: loads(3) }), "2026-10-19");
  assert.equal(g.length, 1);
  assert.equal(g[0].label, "Marathon · no access");
  assert.equal(g[0].detail, "3 loads in 90d");
  assert.equal(accessGaps(baseInput({ loads: loads(2) }), "2026-10-19").length, 0);
});

test("access gaps: valid or merely expired access is not a gap; timed-out access is", () => {
  const mk = (carded_on: string) => baseInput({ loads: loads(4), access: [{ user_id: "u1", terminal_id: "T1", carded_on }] });
  assert.equal(accessGaps(mk("2026-10-01"), "2026-10-19").length, 0);        // valid
  assert.equal(accessGaps(mk("2026-07-01"), "2026-10-19").length, 0);        // expired 2026-09-29, within 30 days
  assert.equal(accessGaps(mk("2026-05-01"), "2026-10-19").length, 1);        // 30+ days past
});

test("plan alerts: gaps show regardless of horizon; extra is horizon-filtered", () => {
  const extra = [
    { key: "s1", kind: "service" as const, subject: "Truck 1", subjectId: "t1", isEquipment: true, label: "Oil service", iso: "2026-10-25", days: 6, state: "expiring" as const },
    { key: "s2", kind: "service" as const, subject: "Truck 1", subjectId: "t1", isEquipment: true, label: "Brake service", iso: "2026-11-15", days: 27, state: "soon" as const },
  ];
  const a = planAlerts(baseInput({ loads: loads(3), extra }), 7, "2026-10-19");
  assert.deepEqual(a.map((x) => x.key).sort(), ["g:u1|T1", "s1"]);
});

test("service alerts: duration type due soon becomes a plan alert", () => {
  const out = serviceAlerts({
    trucks: new Map([["t1", "25184"]]), trailers: new Map(),
    types: [{ service_type_id: "ty", name: "PM", interval_kind: "duration", interval_value: 90, applies_to: "truck", is_active: true }],
    records: [{ service_type_id: "ty", date: "2026-07-25", reading_value: null, created_at: "2026-07-25T00:00:00Z", truck_id: "t1", trailer_id: null }],
    trips: [],
  }, Date.parse("2026-10-19T12:00:00Z"));
  assert.equal(out.length, 1);
  assert.equal(out[0].subject, "Truck 25184");
  assert.equal(out[0].label, "PM service");
  assert.equal(out[0].days, 4);
  assert.equal(out[0].iso, "2026-10-23");
});

import { settingsForTerminal, DEFAULT_TIMELINE_SETTINGS as _D } from "./forecast.ts";
test("settingsForTerminal: terminal override wins, null falls back", () => {
  assert.deepEqual(settingsForTerminal(_D, null), _D);
  const a = settingsForTerminal(_D, { gauging_cutoff: "23:30", gauging_minutes: 90 });
  assert.equal(a.gaugingCutoff, "23:30"); assert.equal(a.gaugingMinutes, 90);
  const b = settingsForTerminal(_D, { gauging_cutoff: null, gauging_minutes: 0 });
  assert.equal(b.gaugingCutoff, _D.gaugingCutoff); assert.equal(b.gaugingMinutes, 0);
});

import { groupsFromPlan, distinctOrders, plannedCompsFor, readPlannedMeta, planFromSlotPayload, slotPayloadFromPlan } from "./compPlan.ts";
test("compPlan: groups by product, defaults fill blanks, overrides win", () => {
  const g = groupsFromPlan({ 1: "D2", 2: "D2", 3: "87" }, { "87": { orderNumber: "B", supplierId: "s2" } }, { orderNumber: "A", supplierId: "s1" });
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], { productId: "D2", comps: [1, 2], orderNumber: "A", supplierId: "s1" });
  assert.deepEqual(g[1], { productId: "87", comps: [3], orderNumber: "B", supplierId: "s2" });
  assert.deepEqual(distinctOrders(g), ["A", "B"]);
  assert.deepEqual(distinctOrders(groupsFromPlan({ 1: "x", 2: "y" }, {}, { orderNumber: "a", supplierId: null })), ["a"]);
});
test("compPlan: planned_comps round trip", () => {
  const g = groupsFromPlan({ 1: "D2", 2: "87" }, { "87": { orderNumber: "B" } }, { orderNumber: "A", supplierId: "s1" });
  const pc = plannedCompsFor(g, (n) => `id-${n}`);
  assert.deepEqual(pc.map((x) => [x.comp_number, x.order_id, x.supplier_id]), [[1, "id-A", "s1"], [2, "id-B", "s1"]]);
  const m = readPlannedMeta(pc);
  assert.equal(m.get(2)?.order_id, "id-B");
  assert.equal(readPlannedMeta("junk").size, 0);
});
test("compPlan: slot payload round trip", () => {
  const p = slotPayloadFromPlan({ 1: "D2" }, [1, 2]);
  assert.equal(p.compPlan[2].empty, true);
  assert.deepEqual(planFromSlotPayload(p), { 1: "D2" });
});

import { buildDispatchedTrip } from "./dispatchTrip.ts";
test("dispatch: product groups give per-product orders and planned_comps", () => {
  let n = 0;
  const rows = buildDispatchedTrip({
    companyId: "c", dispatcherId: "d", driverId: "u", seq: 1,
    leg: { terminalId: "t", terminalName: "T", city: null, state: null, locationId: "l", deliveryType: "drop", supplierId: null, orderNumber: "", startMs: 0, endMs: 1, truckId: null, trailerId: "tr", warnings: [],
      groups: [{ productId: "D2", comps: [1, 2], orderNumber: "A", supplierId: "s1" }, { productId: "87", comps: [3], orderNumber: "B", supplierId: "s2" }] },
  }, { now: new Date(0), newId: () => `id${++n}` });
  assert.equal(rows.orders.length, 2);
  assert.equal((rows.orders[0] as any).is_primary, true);
  assert.equal((rows.pickups[0] as any).supplier_id, "s1");
  const pc = (rows.pickups[0] as any).planned_comps;
  assert.equal(pc.length, 3);
  assert.equal(pc[2].supplier_id, "s2");
  assert.equal(pc[2].order_id, (rows.orders[1] as any).order_id);
});
