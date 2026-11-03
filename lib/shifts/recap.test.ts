import test from "node:test";
import assert from "node:assert/strict";
import { recapDate, scheduledStart, shiftRecap } from "./recap.ts";
import type { Shift } from "./shiftLogic.ts";

const TZ = "America/New_York";
const S = (startedAt: string, endedAt: string | null): Shift => ({ userId: "u", startedAt, endedAt, open: !endedAt, unconfirmed: false, startSource: "app", endSource: null, events: [], hours: 0 });
const NOW = Date.parse("2026-11-03T15:00:00Z"); // 10:00 local Tue

test("hours per day over the period, newest first; an open shift counts to now", () => {
  const r = shiftRecap([S("2026-11-02T12:00:00Z", "2026-11-02T22:30:00Z"), S("2026-11-03T12:00:00Z", null)], { start: "2026-11-01", end: "2026-11-14" }, TZ, NOW);
  assert.deepEqual(r.rows.map((x) => [x.date, x.hours, x.today]), [["2026-11-03", 3, true], ["2026-11-02", 10.5, false]]);
  assert.equal(r.total, 13.5);
});

test("a shift across midnight splits, and days outside the period are left out", () => {
  const r = shiftRecap([S("2026-11-02T03:00:00Z", "2026-11-02T06:00:00Z")], { start: "2026-11-02", end: "2026-11-14" }, TZ, NOW); // 11pm 11/1 to 1am 11/2 local
  assert.deepEqual(r.rows.map((x) => [x.date, x.hours]), [["2026-11-02", 1]]);
});

test("today has no line until a shift has run today", () => {
  const r = shiftRecap([S("2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z")], { start: "2026-11-01", end: "2026-11-14" }, TZ, NOW);
  assert.equal(r.rows.some((x) => x.today), false);
});

test("the scheduled start is today's, else the next scheduled day", () => {
  const sched = { days_of_week: [1, 3], shift_start_local: "06:00:00" }; // Mon, Wed
  assert.equal(scheduledStart(sched, Date.parse("2026-11-02T15:00:00Z"), TZ), "Today 06:00"); // Mon
  assert.equal(scheduledStart(sched, NOW, TZ), "Tomorrow 06:00"); // Tue -> Wed
  assert.equal(scheduledStart({ days_of_week: [5], shift_start_local: "18:30" }, NOW, TZ), "Fri 18:30");
  assert.equal(scheduledStart(null, NOW, TZ), null);
  assert.equal(scheduledStart({ days_of_week: [], shift_start_local: "06:00" }, NOW, TZ), null);
});

test("recap dates read like Tue 11/3", () => assert.equal(recapDate("2026-11-03"), "Tue 11/3"));

test("a shift that just started already has a today line", () => {
  const r = shiftRecap([S("2026-11-03T14:59:00Z", null)], { start: "2026-11-01", end: "2026-11-14" }, TZ, NOW);
  assert.deepEqual(r.rows.map((x) => [x.date, x.hours, x.today]), [["2026-11-03", 0, true]]);
});

test("safety meeting time is added, minus any part already inside a shift", () => {
  const meet = (from: string, to: string) => ({ from: Date.parse(from), to: Date.parse(to) });
  const shifts = [S("2026-11-02T12:00:00Z", "2026-11-02T20:00:00Z")]; // 8 h
  const r = shiftRecap(shifts, { start: "2026-11-01", end: "2026-11-14" }, TZ, NOW, [
    meet("2026-11-02T19:00:00Z", "2026-11-02T21:00:00Z"), // 1 h inside the shift, 1 h after it
    meet("2026-11-01T15:00:00Z", "2026-11-01T16:00:00Z"), // a day with only a meeting
  ]);
  assert.deepEqual(r.rows.map((x) => [x.date, x.hours, x.meeting]), [["2026-11-02", 9, 1], ["2026-11-01", 1, 1]]);
  assert.equal(r.total, 10);
});
