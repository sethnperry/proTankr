import { test } from "node:test";
import assert from "node:assert/strict";
import { auditCsv, canSign, meetingState, nextDueDate, nextToSchedule, reminderDrafts, roster, seriesProblem, signProblem, unsignedCount, type Meeting, type Series } from "./safetyMeeting.ts";
import { nextRunAfter } from "../notify/schedule.ts";

const series: Series = { series_id: "s", title: "Monthly safety", interval_days: 14, starts_on: "2026-11-03", zoom_url: "https://zoom.us/j/1", attachment_path: null, attachment_name: "Hazmat.pptx", is_active: true };
const mtg = (o: Partial<Meeting> = {}): Meeting => ({ meeting_id: "m1", series_id: "s", title: "Monthly safety", scheduled_for: "2026-11-03", zoom_url: "https://zoom.us/j/1", attachment_path: null, attachment_name: "Hazmat.pptx", started_at: null, ended_at: null, closed_at: null, ...o });

test("a series needs a title, a sane interval, a first date and a real link", () => {
  const ok = { title: "Safety", intervalDays: "30", startsOn: "2026-11-03", zoomUrl: "" };
  assert.equal(seriesProblem(ok), null);
  assert.match(seriesProblem({ ...ok, title: " " })!, /title/);
  assert.match(seriesProblem({ ...ok, intervalDays: "0" })!, /1 to 365/);
  assert.match(seriesProblem({ ...ok, intervalDays: "2.5" })!, /1 to 365/);
  assert.match(seriesProblem({ ...ok, startsOn: "" })!, /date/);
  assert.match(seriesProblem({ ...ok, zoomUrl: "zoom.us/j/1" })!, /https/);
});

test("the next date counts every N days from the first; scheduled dates are skipped", () => {
  assert.equal(nextDueDate(series, "2026-10-01"), "2026-11-03");
  assert.equal(nextDueDate(series, "2026-11-03"), "2026-11-03");
  assert.equal(nextDueDate(series, "2026-11-04"), "2026-11-17");
  assert.equal(nextToSchedule(series, [mtg()], "2026-11-01"), "2026-11-17");
  assert.equal(nextToSchedule(series, [mtg(), mtg({ meeting_id: "m2", scheduled_for: "2026-11-17" })], "2026-11-01"), "2026-12-01");
});

test("a meeting is scheduled, open, ended or closed; signing is open from the start until it is closed", () => {
  assert.equal(meetingState(mtg()), "scheduled");
  assert.equal(meetingState(mtg({ started_at: "x" })), "open");
  assert.equal(meetingState(mtg({ started_at: "x", ended_at: "y" })), "ended");
  assert.equal(meetingState(mtg({ started_at: "x", ended_at: "y", closed_at: "z" })), "closed");
  assert.equal(canSign(mtg()), false);
  assert.equal(canSign(mtg({ started_at: "x", ended_at: "y" })), true);
  assert.equal(canSign(mtg({ started_at: "x", closed_at: "z" })), false);
  assert.match(signProblem(null)!, /finger/);
  assert.equal(signProblem("M 1 1 L 20 20 L 40 10"), null);
});

test("the roster lists every driver and lead, unsigned first, and exports for an audit", () => {
  const people = [{ user_id: "a", name: "Zed", role: "driver" }, { user_id: "b", name: "Amy", role: "lead" }, { user_id: "c", name: "Boss", role: "admin" }, { user_id: "d", name: "Bob", role: "driver" }];
  const rows = roster(people, [{ user_id: "b", signed_at: "2026-11-03T15:00:00Z" }]);
  assert.deepEqual(rows.map((r) => [r.name, r.signed]), [["Bob", false], ["Zed", false], ["Amy", true]]);
  assert.equal(unsignedCount(rows), 2);
  const csv = auditCsv(mtg({ started_at: "2026-11-03T14:00:00Z" }), rows).split("\r\n");
  assert.equal(csv[0], "Meeting,Monthly safety");
  assert.ok(csv.includes("Driver,Status,Signed at"));
  assert.ok(csv.some((l) => l.startsWith("Bob,Not signed")));
});

test("reminders are for the one scheduler: a day-before to drivers, a day-after to whoever hasn't signed", () => {
  const [before, after] = reminderDrafts(mtg(), "America/New_York");
  assert.deepEqual(before.recipients, [{ type: "role", value: "driver" }, { type: "role", value: "lead" }]);
  assert.equal(before.cadence.on, "2026-11-02");
  assert.ok(before.payload.body.includes("https://zoom.us/j/1"));
  assert.deepEqual(after.recipients, [{ type: "unsigned", value: "m1" }]);
  assert.equal(after.cadence.on, "2026-11-04");
  assert.ok(nextRunAfter(after.cadence, Date.parse("2026-11-01T00:00:00Z")) != null, "the scheduler can run it");
});
