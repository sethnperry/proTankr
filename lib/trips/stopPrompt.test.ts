import test from "node:test";
import assert from "node:assert/strict";
import { pendingStop } from "./stopPrompt.ts";

const stops = [
  { at: "2026-10-26T10:00:00.000Z", code: "ON", resumedAt: "2026-10-26T10:20:00.000Z" },
  { at: "2026-10-26T12:00:00.000Z", code: "ON", resumedAt: null },
];
test("newest unanswered stop after the last step", () => {
  assert.equal(pendingStop(stops, { afterMs: Date.parse("2026-10-26T09:00:00Z"), handled: new Set() })?.at, stops[1].at);
});
test("answered or earlier stops are skipped", () => {
  assert.equal(pendingStop(stops, { afterMs: Date.parse("2026-10-26T09:00:00Z"), handled: new Set([stops[1].at]) })?.at, stops[0].at);
  assert.equal(pendingStop(stops, { afterMs: Date.parse("2026-10-26T13:00:00Z"), handled: new Set() }), null);
  assert.equal(pendingStop(undefined, { afterMs: 0, handled: new Set() }), null);
});
