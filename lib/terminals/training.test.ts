import test from "node:test";
import assert from "node:assert/strict";
import { addMonthsIso, expiresAfterCompletion, trainingStatus, type TrainingReq } from "./training.ts";

const req: TrainingReq = { terminal_id: "t", required: true, mode: "online", url: null, instructions: null, renewal_months: 12 };

test("adds months, clamping short months and crossing years", () => {
  assert.equal(addMonthsIso("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsIso("2026-11-17", 12), "2027-11-17");
  assert.equal(addMonthsIso("2026-11-17", 3), "2027-02-17");
});
test("annual renewal from completion", () => {
  assert.equal(expiresAfterCompletion("2026-11-10", 12), "2027-11-10");
  assert.equal(expiresAfterCompletion("2026-11-10", null), null);
});
test("status follows the app-wide expiry rule", () => {
  const today = "2026-10-31";
  assert.equal(trainingStatus(req, { completed_at: null, expires_at: "2026-11-17" }, today).state, "soon");
  assert.equal(trainingStatus(req, { completed_at: null, expires_at: "2026-11-03" }, today).state, "expiring");
  assert.equal(trainingStatus(req, { completed_at: null, expires_at: "2026-10-20" }, today).state, "expired");
  assert.equal(trainingStatus(req, { completed_at: null, expires_at: "2027-06-01" }, today).state, "valid");
});
test("no requirement, or nothing on file", () => {
  assert.equal(trainingStatus(null, null).state, "none");
  assert.equal(trainingStatus({ ...req, required: false }, null).state, "none");
  assert.equal(trainingStatus(req, null).state, "not_set");
});
