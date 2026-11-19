import test from "node:test";
import assert from "node:assert/strict";
import { holderIsWorking } from "./holderWorking.ts";
import type { ShiftEventRow } from "../trips/types.ts";

const ev = (type: string, at: string): ShiftEventRow => ({ event_id: type + at, company_id: "c", user_id: "u", event_type: type, occurred_at: at, actor_id: "u", payload: {}, source: "app" });
const now = "2026-11-19T12:00:00Z";

test("nothing at all: idle, can be taken over", () => {
  assert.equal(holderIsWorking({ userId: "u", shiftEvents: [], tripStatuses: [], nowIso: now }), false);
});
test("an open shift means working", () => {
  assert.equal(holderIsWorking({ userId: "u", shiftEvents: [ev("shift_start", "2026-11-19T08:00:00Z")], tripStatuses: [], nowIso: now }), true);
});
test("a shift that ended is idle", () => {
  assert.equal(holderIsWorking({ userId: "u", shiftEvents: [ev("shift_start", "2026-11-18T08:00:00Z"), ev("shift_end", "2026-11-18T20:00:00Z")], tripStatuses: [], nowIso: now }), false);
});
test("an open trip means working; a parked or finished one does not", () => {
  assert.equal(holderIsWorking({ userId: "u", shiftEvents: [], tripStatuses: ["in_transit"], nowIso: now }), true);
  assert.equal(holderIsWorking({ userId: "u", shiftEvents: [], tripStatuses: ["parked", "complete", "cancelled"], nowIso: now }), false);
});
