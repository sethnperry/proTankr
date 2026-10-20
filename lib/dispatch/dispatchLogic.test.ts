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
