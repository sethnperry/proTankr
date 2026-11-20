import test from "node:test";
import assert from "node:assert/strict";
import { flaggedForConfirm } from "./confirmDay.ts";

const ev = (event_type: string, at: string) => ({ event_type, occurred_at: at });

test("flagged and nothing since: show the card", () => {
  assert.equal(flaggedForConfirm([ev("shift_start", "2026-11-19T16:50:00Z"), ev("shift_idle_ask", "2026-11-20T00:00:00Z"), ev("shift_needs_confirm", "2026-11-20T00:15:00Z")]), true);
});
test("never flagged: no card", () => {
  assert.equal(flaggedForConfirm([ev("shift_start", "2026-11-19T16:50:00Z"), ev("shift_idle_ask", "2026-11-20T00:00:00Z")]), false);
});
test("an answer after the flag (still working, anything) clears it; a later server event does not", () => {
  assert.equal(flaggedForConfirm([ev("shift_needs_confirm", "2026-11-20T00:15:00Z"), ev("shift_idle_response", "2026-11-20T08:00:00Z")]), false);
  assert.equal(flaggedForConfirm([ev("shift_needs_confirm", "2026-11-20T00:15:00Z"), ev("shift_idle_ask", "2026-11-20T08:00:00Z")]), true);
});
