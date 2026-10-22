import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleRecap, breakLeftMin, workdayLeftMin } from "./cycleRecap.ts";

const L = (status: string, dateTime: string) => ({ status, dateTime, eventType: 1 });
const NOW = Date.parse("2026-10-22T20:00:00Z");

test("on-duty minutes split at local midnight", () => {
  // UTC tz: ON 22:00 on the 21st to 02:00 on the 22nd, then off
  const r = cycleRecap([L("ON", "2026-10-21T22:00:00Z"), L("OFF", "2026-10-22T02:00:00Z")], NOW, "UTC");
  const d = Object.fromEntries(r.days.map((x) => [x.date, x.minutes]));
  assert.equal(d["2026-10-21"], 120);
  assert.equal(d["2026-10-22"], 120);
  assert.equal(r.usedMin, 240);
  assert.equal(r.days.length, 8);
  assert.equal(r.days[7].date, "2026-10-22");
});

test("off duty and sleeper don't count; available tomorrow drops the oldest day", () => {
  const r = cycleRecap([L("D", "2026-10-15T10:00:00Z"), L("OFF", "2026-10-15T20:00:00Z"), L("SB", "2026-10-22T01:00:00Z")], NOW, "UTC");
  assert.equal(r.days[0].date, "2026-10-15");
  assert.equal(r.days[0].minutes, 600);
  // the 15th falls outside tomorrow's 7-day window
  assert.equal(r.availableTomorrowMin, 70 * 60);
});

test("break clock: 8 h of driving resets after a 30 min stop", () => {
  assert.equal(breakLeftMin([L("D", "2026-10-22T17:00:00Z")], NOW), 8 * 60 - 180);
  assert.equal(breakLeftMin([L("D", "2026-10-22T10:00:00Z"), L("ON", "2026-10-22T18:00:00Z")], NOW), 8 * 60); // 2h ON resets
  assert.equal(breakLeftMin([L("D", "2026-10-22T10:00:00Z"), L("ON", "2026-10-22T19:45:00Z")], NOW), 0); // 15 min isn't a break; 9h45 driven
  assert.equal(breakLeftMin([], NOW), null);
});

test("workday: 14 h from the first on-duty after a 10 h reset; a short rest doesn't reset", () => {
  // off until 14:00Z, then on duty: 6 h in, 8 h left
  assert.equal(workdayLeftMin([L("OFF", "2026-10-21T20:00:00Z"), L("D", "2026-10-22T14:00:00Z")], NOW), 8 * 60);
  // 3 h off mid-shift doesn't reset
  assert.equal(workdayLeftMin([L("OFF", "2026-10-21T20:00:00Z"), L("D", "2026-10-22T12:00:00Z"), L("OFF", "2026-10-22T15:00:00Z"), L("D", "2026-10-22T18:00:00Z")], NOW), 6 * 60);
  // 10 h off then back on resets the window
  assert.equal(workdayLeftMin([L("D", "2026-10-21T20:00:00Z"), L("SB", "2026-10-22T02:00:00Z"), L("D", "2026-10-22T12:30:00Z")], NOW), 14 * 60 - Math.round((NOW - Date.parse("2026-10-22T12:30:00Z")) / 60000));
  assert.equal(workdayLeftMin([], NOW), null);
});
