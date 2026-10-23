import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleRecap, breakLeftMin, workdayLeftMin, lastRestartEnd, nonDrivingSinceMs } from "./cycleRecap.ts";

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
  const logs = [L("D", "2026-10-15T10:00:00Z"), L("OFF", "2026-10-15T20:00:00Z")];
  for (let d = 16; d <= 22; d++) { logs.push(L("ON", `2026-10-${d}T12:00:00Z`)); logs.push(L("SB", `2026-10-${d}T12:30:00Z`)); }
  const r = cycleRecap(logs, NOW, "UTC");
  assert.equal(r.days[0].date, "2026-10-15");
  assert.equal(r.days[0].minutes, 600);
  // the 15th (10h) falls outside tomorrow's 7-day window; the 16th-22nd are 30 min each
  assert.equal(r.availableTomorrowMin, 70 * 60 - 7 * 30);
  assert.equal(r.restartAt, null);
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

test("34-hour restart: days before it drop out of the cycle", () => {
  const logs = [
    L("D", "2026-10-15T10:00:00Z"), L("OFF", "2026-10-15T22:00:00Z"),   // 12h on the 15th
    L("D", "2026-10-18T14:00:00Z"), L("OFF", "2026-10-18T23:00:00Z"),   // 9h on the 18th, after 64h off
  ];
  const now = Date.parse("2026-10-18T23:30:00Z");
  assert.equal(lastRestartEnd(logs, now), Date.parse("2026-10-18T14:00:00Z"));
  const r = cycleRecap(logs, now, "UTC");
  assert.equal(r.days[0].date, "2026-10-18");
  assert.equal(r.days.length, 1);
  assert.equal(r.usedMin, 540);
  assert.equal(r.availableTomorrowMin, 70 * 60 - 540);
  // a 20h rest is not a restart
  assert.equal(lastRestartEnd([L("D", "2026-10-15T10:00:00Z"), L("OFF", "2026-10-15T22:00:00Z"), L("D", "2026-10-16T18:00:00Z")], now), null);
});

test("non-driving stretch: starts when driving ends, counts on-duty, null while driving", () => {
  const T = Date.parse("2026-10-23T15:00:00Z");
  const log = (iso: string, status: string) => L(status, iso);
  // driving 08:00-12:00, then on duty (unloading) since 12:00
  const logs = [log("2026-10-23T08:00:00Z", "D"), log("2026-10-23T12:00:00Z", "ON")];
  assert.equal(nonDrivingSinceMs(logs, T), Date.parse("2026-10-23T12:00:00Z"));
  const driving = [log("2026-10-23T08:00:00Z", "D")];
  assert.equal(nonDrivingSinceMs(driving, T), null);
});
