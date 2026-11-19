import test from "node:test";
import assert from "node:assert/strict";
import { wrapUp } from "./wrapUp.ts";

const M = 60_000, T0 = Date.parse("2026-11-27T12:00:00Z");
const base = { shiftStartedMs: T0 - 600 * M, openTrip: false, askedAtMs: null as number | null };

test("quiet less than 30 minutes after the last load: nothing", () => {
  assert.equal(wrapUp({ ...base, nowMs: T0, lastActivityMs: T0 - 29 * M }).action, "none");
});
test("30 minutes quiet with no open trip: ask", () => {
  assert.equal(wrapUp({ ...base, nowMs: T0, lastActivityMs: T0 - 30 * M }).action, "ask");
});
test("an open trip waits 3 hours before the question", () => {
  assert.equal(wrapUp({ ...base, openTrip: true, nowMs: T0, lastActivityMs: T0 - 120 * M }).action, "none");
  assert.equal(wrapUp({ ...base, openTrip: true, nowMs: T0, lastActivityMs: T0 - 180 * M }).action, "ask");
});
test("asked, under 15 minutes: wait; 15 minutes with no answer: end at the last activity", () => {
  const last = T0 - 50 * M;
  assert.equal(wrapUp({ ...base, nowMs: T0, lastActivityMs: last, askedAtMs: T0 - 14 * M }).action, "none");
  assert.deepEqual(wrapUp({ ...base, nowMs: T0, lastActivityMs: last, askedAtMs: T0 - 15 * M }), { action: "end", atMs: last });
});
test("activity after the question (an answer, a trip step) cancels the ending and restarts the count", () => {
  const r = wrapUp({ ...base, nowMs: T0, lastActivityMs: T0 - 5 * M, askedAtMs: T0 - 20 * M });
  assert.equal(r.action, "none");
});
test("a running empty move is never asked or ended", () => {
  assert.equal(wrapUp({ ...base, movingEmpty: true, nowMs: T0, lastActivityMs: T0 - 500 * M, askedAtMs: T0 - 100 * M }).action, "none");
});
test("no activity at all counts from the shift start", () => {
  assert.equal(wrapUp({ ...base, shiftStartedMs: T0 - 31 * M, nowMs: T0, lastActivityMs: null }).action, "ask");
});
