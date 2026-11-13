import test from "node:test";
import assert from "node:assert/strict";
import { reviewRows, managerConfirmEvent, managerExplanationEvent, confirmedShift } from "./review.ts";
import type { ShiftEventRow } from "../trips/types.ts";

const ev = (id: string, type: string, at: string, source: "app" | "manual" = "app", payload = {}): ShiftEventRow =>
  ({ event_id: id, company_id: "c", user_id: "u", event_type: type, occurred_at: at, actor_id: "u", payload, source });
const NOW = "2026-11-13T12:00:00Z";
const SINCE = "2026-11-01T00:00:00Z";

// A shift started and never ended, last activity 15h later: closed by the system, unconfirmed and long.
const base = [ev("1", "shift_start", "2026-11-10T08:00:00Z"), ev("2", "load_note", "2026-11-10T23:00:00Z")];

test("a forgotten, long shift needs both a reason and a confirmation", () => {
  const r = reviewRows(base, 12, NOW, SINCE, SINCE);
  assert.equal(r.length, 1);
  assert.equal(r[0].needsReason, true);
  assert.equal(r[0].needsConfirm, true);
});

test("confirming ends the shift at the manager's time and clears the confirm flag", () => {
  const row = reviewRows(base, 12, NOW, SINCE, SINCE)[0];
  const e = managerConfirmEvent({ companyId: "c", managerId: "m", row, endAt: "2026-11-10T20:00:00Z", now: NOW });
  assert.ok(!("error" in e));
  const events = [...base, { ...(e as object), event_id: "3" } as ShiftEventRow];
  const s = confirmedShift(events, "u", row.startedAt, NOW)!;
  assert.equal(s.unconfirmed, false);
  assert.equal(s.endedAt, "2026-11-10T20:00:00.000Z");
  assert.equal(s.hours, 12);
});

test("a confirm before the start or in the future is refused", () => {
  const row = { userId: "u", startedAt: "2026-11-10T08:00:00Z" };
  assert.ok("error" in (managerConfirmEvent({ companyId: "c", managerId: "m", row, endAt: "2026-11-10T07:00:00Z", now: NOW }) as object));
  assert.ok("error" in (managerConfirmEvent({ companyId: "c", managerId: "m", row, endAt: "2026-11-14T07:00:00Z", now: NOW }) as object));
});

test("a manager's explanation is marked and clears the reason flag", () => {
  const row = reviewRows(base, 12, NOW, SINCE, SINCE)[0];
  const e = managerExplanationEvent({ companyId: "c", managerId: "m", row, pick: { reasonId: null, label: "Other", category: "other", note: "Waited on a repair" }, now: NOW });
  assert.equal((e.payload as any).entered_by_manager, true);
  assert.equal(e.source, "manual");
  const after = reviewRows([...base, { ...e, event_id: "4" } as ShiftEventRow], 12, NOW, SINCE, SINCE);
  assert.equal(after[0].needsReason, false);
  assert.equal(after[0].needsConfirm, true);
});
