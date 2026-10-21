import test from "node:test";
import assert from "node:assert/strict";
import { dutyFromLogs, dutyCodeOf } from "./dutyLogs.ts";

const at = (h: number) => new Date(Date.UTC(2026, 9, 23, h)).toISOString();
const now = Date.UTC(2026, 9, 23, 20);

test("dutyFromLogs: off-duty stretch spans Off, Sleeper and Personal Conveyance", () => {
  const r = dutyFromLogs([
    { dateTime: at(8), status: "D", eventType: 1 },
    { dateTime: at(12), status: "OFF", eventType: 1 },
    { dateTime: at(14), status: "SB", eventType: 1 },
    { dateTime: at(16), status: "PC", eventType: 3 },
  ], now);
  assert.equal(r.status, "PC");
  assert.equal(r.since, at(16));
  assert.equal(r.offSince, at(12));
});

test("dutyFromLogs: logins, power events and rejected edits are not duty changes", () => {
  const r = dutyFromLogs([
    { dateTime: at(8), status: "ON", eventType: 1 },
    { dateTime: at(18), status: "OFF", eventType: 5 },          // ELD log-off
    { dateTime: at(19), status: "OFF", eventType: 1, state: "InactiveChanged" },
    { dateTime: at(19), status: "LogOff" },
  ], now);
  assert.equal(r.status, "ON");
  assert.equal(r.since, at(8));
  assert.equal(r.offSince, null);
});

test("dutyFromLogs: repeated rows don't restart the clock; names normalise", () => {
  const r = dutyFromLogs([
    { dateTime: at(6), status: "Driving" }, { dateTime: at(7), status: "D" }, { dateTime: at(9), status: "OnDuty" }, { dateTime: at(10), status: "ON" },
  ], now);
  assert.equal(r.status, "ON");
  assert.equal(r.since, at(9));
  assert.equal(dutyCodeOf("Sleeper"), "SB");
  assert.equal(dutyCodeOf("LOGOFF"), null);
});

test("dutyFromLogs: nothing usable", () => {
  assert.deepEqual(dutyFromLogs([], now), { status: null, since: null, offSince: null });
});

import { hosText, resetInfo } from "./progress.ts";
import { restWindow } from "../dispatch/dutyGraph.ts";

test("hosText: off duty shows how long and when the 10 hour reset completes", () => {
  const nowMs = Date.parse("2026-10-23T20:00:00Z");
  const h = { driveLeftMin: 660, dutyLeftMin: 840, status: "OFF", at: "2026-10-23T20:00:00Z", statusSince: "2026-10-23T11:30:00Z", offSince: "2026-10-23T11:30:00Z" };
  assert.match(hosText(h, nowMs).text, /Off duty 8\.5 h · 10 h reset in 1\.5 h/);
  assert.equal(Math.round(resetInfo(h, nowMs)!.resetInMin), 90);
  assert.match(hosText({ ...h, offSince: "2026-10-22T20:00:00Z", statusSince: "2026-10-22T20:00:00Z" }, nowMs).text, /10 h reset done/);
  assert.match(hosText({ ...h, status: "ON", offSince: null }, nowMs).text, /On duty 8\.5 h/);
});

test("restWindow: from reset complete to the usual start; none if they usually start sooner", () => {
  const nowMs = new Date(2026, 9, 23, 20, 0).getTime();
  const h = { status: "OFF", offSince: new Date(2026, 9, 23, 14, 0).toISOString() }; // reset done at midnight
  const w = restWindow(h, 3 * 60, nowMs)!; // usually starts 03:00
  assert.equal(new Date(w.fromMs).getHours(), 0);
  assert.equal(new Date(w.toMs).getHours(), 3);
  assert.equal(restWindow(h, 23 * 60, nowMs), null); // usual start 23:00 is before the reset completes
  assert.equal(restWindow({ status: "D", offSince: null }, 180, nowMs), null);
});
