import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignBoards, openCampaignsFor, reviewQueue, serviceLines, unitBoard, type BoardInspection, type BoardUnit, type Campaign } from "./board.ts";

const truck = (id: string, region: string | null = "R1", active = true): BoardUnit => ({ id, kind: "truck", name: id, region, active });
const trailer = (id: string): BoardUnit => ({ id, kind: "trailer", name: id, region: "R1", active: true });
const insp = (id: string, unitId: string, campaign: string | null, review: BoardInspection["review_status"] = "none", overall: BoardInspection["overall"] = "good", at = "2026-11-02T10:00:00Z"): BoardInspection =>
  ({ inspection_id: id, unitId, kind: "truck", driver_id: "d", campaign_id: campaign, created_at: at, overall, review_status: review, items: overall === "good" ? [] : [{ key: "tires", label: "Tires and wheels", condition: overall, note: "worn" }] });
const camp = (o: Partial<Campaign> = {}): Campaign => ({ campaign_id: "c1", name: "Fall tire check", unit_kind: "truck", region: null, due_on: null, closed_at: null, created_at: "2026-11-01T00:00:00Z", ...o });

test("a campaign shows who has and who hasn't submitted; only its own region and kind count", () => {
  const units = [truck("1"), truck("2"), truck("3", "R2"), trailer("t1"), truck("4", "R1", false)];
  const [b] = campaignBoards([camp({ region: "R1" })], units, [insp("i1", "1", "c1", "pending"), insp("i2", "3", "c1")]);
  assert.deepEqual(b.done.map((u) => u.id), ["1"]);
  assert.deepEqual(b.outstanding.map((u) => u.id), ["2"]);
  assert.equal(b.targets, 2);
  assert.equal(b.pendingReview, 1);
  const all = campaignBoards([camp({ unit_kind: "both" })], units, [])[0];
  assert.equal(all.targets, 4);
});

test("only campaign submissions go to review", () => {
  const q = reviewQueue([insp("a", "1", null, "none"), insp("b", "1", "c1", "pending"), insp("c", "2", "c1", "reviewed")]);
  assert.deepEqual(q.map((i) => i.inspection_id), ["b"]);
});

test("a driver is asked for the campaigns their unit hasn't done", () => {
  const u = truck("1");
  assert.equal(openCampaignsFor(u, [camp()], []).length, 1);
  assert.equal(openCampaignsFor(u, [camp()], [insp("a", "1", "c1")]).length, 0);
  assert.equal(openCampaignsFor(u, [camp({ closed_at: "2026-11-03T00:00:00Z" })], []).length, 0);
  assert.equal(openCampaignsFor(trailer("t1"), [camp()], []).length, 0);
});

test("service lines: last done and next due by date or reading; never done is overdue", () => {
  const types = [
    { service_type_id: "w", name: "Wet", interval_kind: "miles" as const, interval_value: 65000, applies_to: "truck" as const, is_active: true },
    { service_type_id: "g", name: "Grease", interval_kind: "duration" as const, interval_value: 90, applies_to: "both" as const, is_active: true },
    { service_type_id: "r", name: "Repair", interval_kind: "none" as const, interval_value: null, applies_to: "both" as const, is_active: true },
  ];
  const lines = serviceLines(truck("1"), types, [{ unitId: "1", service_type_id: "w", date: "2026-10-01", reading_value: 300000, created_at: "x" }], "2026-11-03");
  assert.deepEqual(lines.map((l) => [l.name, l.lastDate, l.next]), [["Wet", "10/1/26", "Due at 365,000 mi"], ["Grease", null, "Never done"]]);
  assert.equal(lines[1].state, "expired");
});

test("the board puts the worst units first and counts a failed inspection as a problem", () => {
  const rows = unitBoard({ units: [truck("1"), truck("2")], types: [], records: [], permits: [{ unitId: "1", name: "Registration", expiration_date: "2030-01-01" }], inspections: [insp("i", "2", null, "none", "replace_soon")], todayIso: "2026-11-03" });
  assert.equal(rows[0].unit.id, "2");
  assert.equal(rows[0].worst, "expired");
  assert.deepEqual(rows[0].inspection?.failed, ["Tires and wheels"]);
  assert.equal(rows[1].worst, "valid");
});
