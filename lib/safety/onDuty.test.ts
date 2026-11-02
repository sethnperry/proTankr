import test from "node:test";
import assert from "node:assert/strict";
import { hoursByDay, meetingMinutes, meetingWindow, uncovered } from "./onDuty.ts";

const t = (s: string) => Date.parse(s);

test("a meeting counts from its start to its end, or to the signing if it hasn't ended", () => {
  const w = meetingWindow({ started_at: "2026-11-02T15:00:00Z", ended_at: "2026-11-02T16:00:00Z" }, "2026-11-02T15:30:00Z")!;
  assert.equal(meetingMinutes(w), 60);
  const open = meetingWindow({ started_at: "2026-11-02T15:00:00Z", ended_at: null }, "2026-11-02T15:20:00Z")!;
  assert.equal(meetingMinutes(open), 20);
  assert.equal(meetingWindow({ started_at: null, ended_at: null }, "2026-11-02T15:20:00Z"), null);
  assert.equal(meetingWindow({ started_at: "2026-11-02T16:00:00Z", ended_at: "2026-11-02T15:00:00Z" }, "x"), null);
});

test("a meeting left open for days is capped", () => {
  const w = meetingWindow({ started_at: "2026-11-02T15:00:00Z", ended_at: null }, "2026-11-05T15:00:00Z")!;
  assert.equal(meetingMinutes(w), 480);
});

test("time the log already shows on duty isn't counted twice", () => {
  const w = { from: t("2026-11-02T15:00:00Z"), to: t("2026-11-02T16:00:00Z") };
  assert.equal(uncovered(w, []).length, 1);
  assert.equal(uncovered(w, [{ from: t("2026-11-02T14:00:00Z"), to: t("2026-11-02T17:00:00Z") }]).length, 0);
  const mid = uncovered(w, [{ from: t("2026-11-02T15:20:00Z"), to: t("2026-11-02T15:40:00Z") }]);
  assert.equal(mid.length, 2);
  assert.equal(mid.reduce((a, p) => a + (p.to - p.from), 0) / 60_000, 40);
  const edge = uncovered(w, [{ from: t("2026-11-02T14:30:00Z"), to: t("2026-11-02T15:30:00Z") }]);
  assert.equal(edge.reduce((a, p) => a + (p.to - p.from), 0) / 60_000, 30);
});

test("hours split at local midnight", () => {
  // 23:30 to 00:30 New York time on Nov 2 -> 0.5 h each side.
  const w = { from: t("2026-11-03T04:30:00Z"), to: t("2026-11-03T05:30:00Z") };
  const d = hoursByDay([w], "America/New_York");
  assert.equal(Math.round(d["2026-11-02"] * 10) / 10, 0.5);
  assert.equal(Math.round(d["2026-11-03"] * 10) / 10, 0.5);
});
