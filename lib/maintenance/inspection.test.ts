import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "../trips/tripStore.ts";
import { INSPECTION_ITEMS, createInspection, inspectionProblem, worstCondition, type Ratings } from "./inspection.ts";

const allGood = (kind: "truck" | "trailer"): Ratings => Object.fromEntries(INSPECTION_ITEMS[kind].map((i) => [i.key, { condition: "good" as const, note: "" }]));

test("every item must be rated, and anything not Good says what's wrong", () => {
  assert.match(inspectionProblem("truck", {})!, /Rate/);
  const r = allGood("trailer");
  assert.equal(inspectionProblem("trailer", r), null);
  r.bolsters = { condition: "fair", note: " " };
  assert.match(inspectionProblem("trailer", r)!, /Bolsters/);
  r.bolsters = { condition: "fair", note: "surface rust" };
  assert.equal(inspectionProblem("trailer", r), null);
});

test("the worst condition wins", () => {
  assert.equal(worstCondition(["good", "fair", "good"]), "fair");
  assert.equal(worstCondition(["fair", "replace_soon"]), "replace_soon");
  assert.equal(worstCondition([]), "good");
});

test("a clean inspection makes no work order; a campaign one waits for review", () => {
  const store = createTripStore({ storage: null, storageKey: "k" });
  const a = createInspection(store, { companyId: "c", driverId: "d", driverName: "Seth", kind: "truck", unitId: "t", unitName: "25184", ratings: allGood("truck"), campaignId: "camp", notes: "", captureId: null });
  assert.equal(a.inspection.overall, "good");
  assert.equal(a.inspection.review_status, "pending");
  assert.equal(a.workOrder, null);
  const b = createInspection(store, { companyId: "c", driverId: "d", driverName: "Seth", kind: "truck", unitId: "t", unitName: "25184", ratings: allGood("truck"), campaignId: null, notes: "", captureId: null });
  assert.equal(b.inspection.review_status, "none");
});

test("a failed item plans one work order, once, even if the tap is retried", () => {
  const store = createTripStore({ storage: null, storageKey: "k2" });
  const r = allGood("trailer");
  r.tires = { condition: "replace_soon", note: "bald on the outside" };
  const args = { companyId: "c", driverId: "d", driverName: "Seth", kind: "trailer" as const, unitId: "tr", unitName: "3151", ratings: r, campaignId: null, notes: "", captureId: null, id: "11111111-2222-4333-8444-555555555555" };
  const a = createInspection(store, args);
  const b = createInspection(store, args);
  assert.equal(a.inspection.overall, "replace_soon");
  assert.equal(a.workOrder?.status, "planned");
  assert.equal(a.workOrder?.source, "failed_inspection");
  assert.equal(a.workOrder?.trailer_id, "tr");
  assert.equal(a.workOrder?.work_order_id, b.workOrder?.work_order_id);
  assert.equal(store.list("work_orders").length, 1);
  assert.equal(store.list("unit_inspections").length, 1);
});
