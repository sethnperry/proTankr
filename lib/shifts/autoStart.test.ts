import test from "node:test";
import assert from "node:assert/strict";
import { snoozed, startTimeProblem, telematicsStart } from "./autoStart.ts";

const NOW = Date.parse("2026-11-03T15:00:00Z");

test("a start time can't be in the future or more than a day back", () => {
  assert.equal(startTimeProblem(NOW - 3600_000, NOW), null);
  assert.match(startTimeProblem(NOW + 10 * 60_000, NOW) ?? "", /future/);
  assert.match(startTimeProblem(NOW - 30 * 3600_000, NOW) ?? "", /day ago/);
  assert.match(startTimeProblem(NaN, NOW) ?? "", /Pick/);
});

const hos = (status: string, since: string) => ({ status, statusSince: since });
const base = { nowMs: NOW, shiftOpen: false, lastEndedMs: null, declinedSince: null };

test("on duty or driving with no shift open offers a start at the time that status began", () => {
  const r = telematicsStart({ ...base, hos: hos("D", "2026-11-03T13:30:00Z") });
  assert.equal(r?.atMs, Date.parse("2026-11-03T13:30:00Z"));
  assert.ok(telematicsStart({ ...base, hos: hos("ON", "2026-11-03T14:00:00Z") }));
  assert.equal(telematicsStart({ ...base, hos: hos("OFF", "2026-11-03T14:00:00Z") }), null);
  assert.equal(telematicsStart({ ...base, hos: hos("SB", "2026-11-03T14:00:00Z") }), null);
});

test("not offered with a shift open, after they ended one on purpose, when too old, or after they said no", () => {
  const h = hos("D", "2026-11-03T13:30:00Z");
  assert.equal(telematicsStart({ ...base, hos: h, shiftOpen: true }), null);
  assert.equal(telematicsStart({ ...base, hos: h, lastEndedMs: Date.parse("2026-11-03T14:00:00Z") }), null);
  assert.ok(telematicsStart({ ...base, hos: h, lastEndedMs: Date.parse("2026-11-03T13:00:00Z") }));
  assert.equal(telematicsStart({ ...base, hos: hos("D", "2026-11-02T10:00:00Z") }), null);
  assert.equal(telematicsStart({ ...base, hos: h, declinedSince: "2026-11-03T13:30:00Z" }), null);
  assert.equal(telematicsStart({ ...base, hos: null }), null);
});

test("a snooze lasts four hours", () => {
  assert.equal(snoozed(NOW - 3 * 3600_000, NOW), true);
  assert.equal(snoozed(NOW - 5 * 3600_000, NOW), false);
  assert.equal(snoozed(null, NOW), false);
});
