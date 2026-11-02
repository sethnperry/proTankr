import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "../trips/tripStore.ts";
import { buildRepairEmail, createRepairWorkOrder, fromAddress, regionSlug, repairProblem, repairSubject } from "./repairRequest.ts";

test("a repair request needs a unit, what's wrong, and a few words", () => {
  assert.match(repairProblem({ unitId: null, unitName: "", category: "brakes", note: "x" })!, /unit/);
  assert.match(repairProblem({ unitId: "t", unitName: "1", category: null, note: "x" })!, /wrong/);
  assert.match(repairProblem({ unitId: "t", unitName: "1", category: "brakes", note: "  " })!, /few words/);
  assert.equal(repairProblem({ unitId: "t", unitName: "1", category: "brakes", note: "air leak" }), null);
});

test("subject and sender follow the unit, the driver and the region", () => {
  assert.equal(repairSubject("truck", "25184", "Seth Perry"), "Truck 25184 (Seth Perry)");
  assert.equal(repairSubject("trailer", " 3151 ", ""), "Trailer 3151");
  assert.equal(regionSlug("Gemini Region 502 / South"), "gemini-region-502-south");
  assert.equal(fromAddress("Gemini Region 502"), "servicerequest+gemini-region-502@protankr.com");
  assert.equal(fromAddress(null), "servicerequest@protankr.com");
});

test("the work order is created once, awaiting approval, with the details the email needs", () => {
  const store = createTripStore({ storage: null, storageKey: "t" });
  const a = createRepairWorkOrder(store, { companyId: "c", reportedBy: "u", kind: "truck", unitId: "t1", unitName: "25184", driverName: "Seth Perry", region: "R1", category: "brakes", note: "air leak", captureId: null, id: "00000000-0000-4000-8000-000000000001" });
  const b = createRepairWorkOrder(store, { companyId: "c", reportedBy: "u", kind: "truck", unitId: "t1", unitName: "25184", driverName: "Seth Perry", region: "R1", category: "brakes", note: "air leak", captureId: null, id: "00000000-0000-4000-8000-000000000001" });
  assert.equal(a.status, "awaiting_approval");
  assert.equal(a.source, "repair_request");
  assert.equal(a.truck_id, "t1");
  assert.equal(a.work_order_id, b.work_order_id);
  assert.equal(store.list("work_orders").length, 1);
});

test("the email names the unit and driver, links both decisions, and escapes the driver's words", () => {
  const e = buildRepairEmail({ subject: "Truck 25184 (Seth Perry)", detail: { unit_kind: "truck", unit_name: "25184", driver_name: "Seth Perry", region: null, category: "brakes", note: "<b>air</b> leak", capture_id: null }, approveUrl: "https://x/approve/a", denyUrl: "https://x/approve/d" });
  assert.ok(e.html.includes("https://x/approve/a") && e.html.includes("https://x/approve/d"));
  assert.ok(e.html.includes("&lt;b&gt;air&lt;/b&gt; leak"));
  assert.ok(e.text.includes("Approve: https://x/approve/a"));
});
