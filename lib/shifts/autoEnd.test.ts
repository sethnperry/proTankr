import test from "node:test";
import assert from "node:assert/strict";
import { autoEndAt } from "./autoEnd.ts";

const now = Date.parse("2026-11-13T22:00:00Z");
const base = { openStartedAt: "2026-11-13T10:00:00Z", nowMs: now };
test("closes at the moment off duty began, after 15 minutes", () => {
  assert.equal(autoEndAt({ ...base, hos: { status: "OFF", statusSince: "2026-11-13T21:40:00Z", at: "2026-11-13T21:59:00Z" } }), "2026-11-13T21:40:00.000Z");
});
test("waits, and ignores sleeper, personal, driving, stale readings and earlier off duty", () => {
  assert.equal(autoEndAt({ ...base, hos: { status: "OFF", statusSince: "2026-11-13T21:50:00Z", at: "2026-11-13T21:59:00Z" } }), null);
  assert.equal(autoEndAt({ ...base, hos: { status: "SB", statusSince: "2026-11-13T21:00:00Z", at: "2026-11-13T21:59:00Z" } }), null);
  assert.equal(autoEndAt({ ...base, hos: { status: "PC", statusSince: "2026-11-13T21:00:00Z", at: "2026-11-13T21:59:00Z" } }), null);
  assert.equal(autoEndAt({ ...base, hos: { status: "D", statusSince: "2026-11-13T21:00:00Z", at: "2026-11-13T21:59:00Z" } }), null);
  assert.equal(autoEndAt({ ...base, hos: { status: "OFF", statusSince: "2026-11-13T21:00:00Z", at: "2026-11-13T21:20:00Z" } }), null);
  assert.equal(autoEndAt({ ...base, hos: { status: "OFF", statusSince: "2026-11-13T09:00:00Z", at: "2026-11-13T21:59:00Z" } }), null);
  assert.equal(autoEndAt({ ...base, hos: null }), null);
});
