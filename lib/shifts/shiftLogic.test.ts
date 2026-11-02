import test from "node:test";
import assert from "node:assert/strict";
import { deriveShifts, isLongShift, needsExplanation, openShift, shiftPrompt, SHIFT_END, SHIFT_EXPLANATION, SHIFT_LONG_ACK, SHIFT_START, clockHM } from "./shiftLogic.ts";
import type { ShiftEventRow } from "../trips/types.ts";

let n = 0;
const ev = (type: string, at: string, source: ShiftEventRow["source"] = "app", user = "u1"): ShiftEventRow =>
  ({ event_id: `e${++n}`, company_id: "c", user_id: user, event_type: type, occurred_at: at, actor_id: user, payload: {}, source });

test("start and end make one closed shift with its hours", () => {
  const s = deriveShifts([ev(SHIFT_START, "2026-11-01T10:00:00Z"), ev(SHIFT_END, "2026-11-01T22:30:00Z")], "u1", "2026-11-02T00:00:00Z");
  assert.equal(s.length, 1);
  assert.equal(s[0].open, false);
  assert.equal(s[0].unconfirmed, false);
  assert.equal(s[0].hours, 12.5);
  assert.equal(clockHM(s[0].hours), "12:30");
});

test("a shift can run with no load: other events just attach to it", () => {
  const s = deriveShifts([ev(SHIFT_START, "2026-11-01T10:00:00Z"), ev("call_out", "2026-11-01T11:00:00Z")], "u1", "2026-11-01T12:00:00Z");
  assert.equal(s[0].open, true);
  assert.equal(s[0].events.length, 2);
  assert.equal(openShift(s)?.startedAt, "2026-11-01T10:00:00Z");
});

test("forgot to end: closes at its last event, unconfirmed", () => {
  const s = deriveShifts([ev(SHIFT_START, "2026-11-01T10:00:00Z"), ev("note", "2026-11-01T15:00:00Z")], "u1", "2026-11-02T20:00:00Z");
  assert.equal(s[0].open, false);
  assert.equal(s[0].unconfirmed, true);
  assert.equal(s[0].endedAt, "2026-11-01T15:00:00Z");
  assert.equal(s[0].hours, 5);
});

test("a second start closes the first at its last event, unconfirmed", () => {
  const s = deriveShifts([ev(SHIFT_START, "2026-11-01T10:00:00Z"), ev(SHIFT_START, "2026-11-02T08:00:00Z")], "u1", "2026-11-02T09:00:00Z");
  assert.equal(s.length, 2);
  assert.equal(s[0].unconfirmed, true);
  assert.equal(s[1].open, true);
});

test("Geotab's start and stop win over the phone's when they are the same moment", () => {
  const s = deriveShifts([
    ev(SHIFT_START, "2026-11-01T10:20:00Z", "app"),
    ev(SHIFT_START, "2026-11-01T10:00:00Z", "geotab"),
    ev(SHIFT_END, "2026-11-01T22:40:00Z", "app"),
    ev(SHIFT_END, "2026-11-01T22:30:00Z", "geotab"),
  ], "u1", "2026-11-02T00:00:00Z");
  assert.equal(s.length, 1);
  assert.equal(s[0].startedAt, "2026-11-01T10:00:00Z");
  assert.equal(s[0].startSource, "geotab");
  assert.equal(s[0].endedAt, "2026-11-01T22:30:00Z");
  assert.equal(s[0].endSource, "geotab");
});

test("a phone start far from any Geotab start is its own shift", () => {
  const s = deriveShifts([ev(SHIFT_START, "2026-11-01T10:00:00Z", "geotab"), ev(SHIFT_START, "2026-11-01T20:00:00Z", "app")], "u1", "2026-11-01T21:00:00Z");
  assert.equal(s.length, 2);
});

test("only this driver's events count", () => {
  assert.equal(deriveShifts([ev(SHIFT_START, "2026-11-01T10:00:00Z", "app", "u2")], "u1", "2026-11-01T12:00:00Z").length, 0);
});

test("long shift needs an explanation until one is given", () => {
  const base = [ev(SHIFT_START, "2026-11-01T06:00:00Z"), ev(SHIFT_END, "2026-11-01T20:00:00Z")];
  assert.equal(isLongShift(deriveShifts(base, "u1", "2026-11-02T00:00:00Z")[0], 12), true);
  assert.equal(needsExplanation(deriveShifts(base, "u1", "2026-11-02T00:00:00Z")[0], 12), true);
  const done = deriveShifts([...base, ev(SHIFT_EXPLANATION, "2026-11-01T20:05:00Z")], "u1", "2026-11-02T00:00:00Z")[0];
  assert.equal(needsExplanation(done, 12), false);
});

test("prompts: long once, then idle after a quiet stretch, quiet again after an answer", () => {
  const start = "2026-11-01T06:00:00Z";
  const s1 = deriveShifts([ev(SHIFT_START, start)], "u1", "2026-11-01T19:00:00Z")[0];
  assert.equal(shiftPrompt(s1, "2026-11-01T19:00:00Z", { maxHours: 12, lastActivityAt: "2026-11-01T18:50:00Z" }), "long");
  const s2 = deriveShifts([ev(SHIFT_START, start), ev(SHIFT_LONG_ACK, "2026-11-01T19:01:00Z")], "u1", "2026-11-01T19:05:00Z")[0];
  assert.equal(shiftPrompt(s2, "2026-11-01T19:05:00Z", { maxHours: 12, lastActivityAt: "2026-11-01T19:00:00Z" }), null);
  assert.equal(shiftPrompt(s2, "2026-11-01T21:00:00Z", { maxHours: 12, lastActivityAt: "2026-11-01T19:00:00Z" }), "idle");
  assert.equal(shiftPrompt(null, "2026-11-01T21:00:00Z", { maxHours: 12, lastActivityAt: null }), null);
});
