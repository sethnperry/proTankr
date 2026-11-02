import test from "node:test";
import assert from "node:assert/strict";
import { campaignBars, dayRibbon, fleetState, fleetStrip, gauges, heatmap, inRegions, needsYou, regionOptions, tripSegments, worstState, type FleetUnit } from "./company.ts";
import type { PlanAlert } from "../dispatch/planAlerts.ts";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const U = (o: Partial<FleetUnit>): FleetUnit => ({ id: "t1", name: "25184", kind: "truck", region: "South", active: true, status_code: "in_use", status_updated_at: "2026-11-01T12:00:00Z", ...o });

test("an empty region selection shows everything; unnamed regions group together", () => {
  assert.equal(inRegions(new Set(), "South"), true);
  assert.equal(inRegions(new Set(["South"]), "south "), false);
  assert.equal(inRegions(new Set(["No region"]), null), true);
  assert.deepEqual(regionOptions(["South", null, "North", "South"]), ["North", "South", "No region"]);
});

test("fleet states and strip: deadline first, days in status fill the box, inactive and other regions drop out", () => {
  assert.equal(fleetState("AVAIL"), "available");
  assert.equal(fleetState("Deadline"), "deadline");
  const s = fleetStrip([U({}), U({ id: "t2", name: "9", status_code: "deadline", status_updated_at: "2026-10-26T12:00:00Z" }), U({ id: "t3", active: false }), U({ id: "t4", region: "North", status_code: "readyline" })], NOW, new Set(["South"]));
  assert.deepEqual(s.boxes.map((b) => b.id), ["t2", "t1"]);
  assert.equal(s.boxes[0].days, 7);
  assert.equal(s.boxes[0].fill, 0.5);
  assert.deepEqual(s.counts, { in_use: 1, deadline: 1, readyline: 0, available: 0 });
});

test("needs you totals only what is waiting", () => {
  const n = needsYou({ repairsAwaiting: 2, unconfirmedShifts: 0, unreviewedBillable: 3, pendingReviews: 0 });
  assert.equal(n.total, 5);
  assert.deepEqual(n.items.map((i) => i.key), ["repairs", "billable"]);
});

test("gauges grey out at zero and go red when it matters", () => {
  const g = gauges({ needs: 0, down: 2, hoursRisk: 0, complianceWorst: "expired", complianceCount: 4, onShift: 5, delayedMin: 95, callouts: 3, calloutsBlocking: 1, billableMin: 0 });
  const by = Object.fromEntries(g.map((x) => [x.key, x]));
  assert.equal(by.down.color, "#ef4444");
  assert.equal(by.needs.color, "rgba(255,255,255,0.35)");
  assert.equal(by.delayed.value, "1h 35m");
  assert.equal(by.callouts.value, "3/1");
  assert.equal(by.compliance.color, by.down.color);
  assert.equal(worstState(["valid", "soon"]), "soon");
  assert.equal(worstState([]), null);
});

test("a trip becomes driving with loading and delivering painted over it", () => {
  const segs = tripSegments({ userId: "d", name: "Sam", region: null, startedAt: "2026-11-02T08:00:00Z", completedAt: null,
    pickups: [{ arrived_at: "2026-11-02T09:00:00Z", left_at: "2026-11-02T10:00:00Z" }], deliveries: [{ arrived_at: "2026-11-02T11:00:00Z", left_at: null }] }, NOW);
  assert.deepEqual(segs.map((s) => s.activity), ["driving", "loading", "delivering"]);
  assert.equal(segs[2].to, NOW);
});

test("the day ribbon clips to the day, groups by driver and sorts by name", () => {
  const day0 = Date.parse("2026-11-02T04:00:00Z"), day1 = day0 + 86400_000;
  const raw = [
    { userId: "b", name: "Bob", region: "South", activity: "driving" as const, from: day0 - 3600_000, to: day0 + 6 * 3600_000, source: "app" as const },
    { userId: "a", name: "Amy", region: "North", activity: "loading" as const, from: day0 + 12 * 3600_000, to: day0 + 13 * 3600_000, source: "geotab" as const },
    { userId: "c", name: "Cy", region: "South", activity: "driving" as const, from: day1 + 1, to: day1 + 5, source: "app" as const },
  ];
  const lanes = dayRibbon(raw, day0, day1, new Set());
  assert.deepEqual(lanes.map((l) => l.name), ["Amy", "Bob"]);
  assert.equal(lanes[1].segs[0].left, 0);
  assert.equal(lanes[1].segs[0].width, 0.25);
  assert.equal(dayRibbon(raw, day0, day1, new Set(["North"])).length, 1);
});

const A = (o: Partial<PlanAlert>): PlanAlert => ({ key: "k", kind: "license", subject: "Sam", subjectId: "u1", isEquipment: false, label: "License", iso: "2026-11-01", days: -1, state: "expired", ...o });
test("the heatmap puts requirements against regions and carries who is outstanding", () => {
  const regionOf = (id: string) => (id === "u1" ? "South" : id === "u2" ? "North" : null);
  const h = heatmap([A({}), A({ subjectId: "u2", subject: "Amy", state: "soon", days: 20 }), A({ kind: "access", subjectId: "u1", label: "Marathon access" }), A({ kind: "no_access", subjectId: "u2" })], regionOf,
    [{ label: "Safety meeting", items: [{ subjectId: "u3", subject: "Bob", label: "Not signed", state: "expired", region: null }] }], new Set());
  assert.deepEqual(h.columns, ["North", "South", "No region"]);
  const lic = h.rows.find((r) => r.label === "License")!;
  assert.equal(lic.total, 2);
  assert.equal(lic.cells[1].worst, "expired");
  assert.equal(lic.cells[0].worst, "soon");
  assert.equal(h.rows.find((r) => r.label === "Terminal access")!.total, 2);
  assert.equal(h.rows.find((r) => r.label === "Safety meeting")!.cells[2].count, 1);
  assert.equal(heatmap([A({})], regionOf, [], new Set(["North"])).rows.length, 0);
});

test("campaign bars show open campaigns with done and outstanding", () => {
  const board = (closed: string | null) => ({ campaign: { campaign_id: "c", name: "Tires", unit_kind: "both" as const, region: null, due_on: "2026-11-10", closed_at: closed, created_at: "x" }, targets: 3, done: [{}] as any, outstanding: [{}, {}] as any, pendingReview: 1 });
  assert.equal(campaignBars([board(null), board("2026-11-01")]).length, 1);
  assert.deepEqual(campaignBars([board(null)])[0], { id: "c", name: "Tires", due: "2026-11-10", total: 3, done: 1, outstanding: 2, pending: 1, closed: false });
});
