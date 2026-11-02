import test from "node:test";
import assert from "node:assert/strict";
import { buildWorklog, type WlTrip } from "./buildWorklog.ts";
import { renderWorklogBody, worklogSubject } from "./renderWorklog.ts";
import { localMidnightMs, localDateOf, clock } from "./time.ts";

const TZ = "America/New_York";
const trip = (o: Partial<WlTrip>): WlTrip => ({
  tripId: "t", orders: ["4816492"], startedAt: "2026-10-25T19:00:00Z", endedAt: "2026-10-26T07:30:00Z", // 3:00p to 3:30a EDT
  beginMiles: 1000, endMiles: 1504, loadedMiles: 400, compCount: 3, loadCount: 2,
  loads: [{ comp: 1, code: "D2", name: "ULSD", gross: 7728, net: 7100 }, { comp: 3, code: "D2", name: "ULSD", gross: 7728, net: 7245 }],
  stops: [{ kind: "pickup", name: "Marathon", city: "Tampa", arrivedAt: "2026-10-25T20:00:00Z", leftAt: "2026-10-25T21:00:00Z" }, { kind: "delivery", name: "Loves", number: "495", arrivedAt: "2026-10-26T05:00:00Z", leftAt: "2026-10-26T07:30:00Z" }],
  ...o,
});

test("local time helpers", () => {
  assert.equal(new Date(localMidnightMs("2026-10-26", TZ)).toISOString(), "2026-10-26T04:00:00.000Z");
  assert.equal(localDateOf(Date.parse("2026-10-26T03:00:00Z"), TZ), "2026-10-25");
  assert.equal(clock(Date.parse("2026-10-25T19:00:00Z"), TZ), "3:00p");
  assert.equal(clock(Date.parse("2026-10-26T04:00:00Z"), TZ), "12:00a");
});

test("a trip across midnight shows on both days; hours and miles split, loads counted once", () => {
  const w = buildWorklog({ driverName: "S", range: { start: "2026-10-25", end: "2026-10-26" }, tz: TZ, title: "Weekly", trips: [trip({})], purchases: [] });
  assert.equal(w.days.length, 2);
  const [a, b] = w.days;
  assert.equal(a.hours, 9);    // 3:00p to midnight
  assert.equal(b.hours, 3.5);  // midnight to 3:30a
  assert.equal(a.midnightAfter, true);
  assert.equal(a.loads, 2); assert.equal(b.loads, 0);
  assert.equal(a.rows[0].continues, true); assert.equal(b.rows[0].continued, true);
  assert.equal(a.miles + b.miles, 504);
  assert.equal(a.gross, 15456); assert.equal(b.gross, 0);
  assert.equal(w.summary.hours, 12.5);
  assert.equal(w.summary.loads, 2);
  assert.equal(w.summary.net, 14345);
  assert.equal(a.rows[0].products, "D2/MT/D2");
  assert.equal(a.rows[0].route, "Marathon/Tampa to Loves 495");
});

test("summary: miles loaded, empty, total; by product; unknown loaded miles", () => {
  const w = buildWorklog({ driverName: "S", range: { start: "2026-10-25", end: "2026-10-26" }, tz: TZ, title: "Weekly", trips: [trip({}), trip({ tripId: "u", startedAt: "2026-10-25T13:00:00Z", endedAt: "2026-10-25T15:00:00Z", loadedMiles: null, beginMiles: 0, endMiles: 100 })], purchases: [] });
  assert.equal(w.summary.miles.total, 604);
  assert.equal(w.summary.miles.loaded, 400);
  assert.equal(w.summary.miles.empty, 104);
  assert.equal(w.summary.miles.partial, true);
  assert.equal(w.summary.byProduct[0].code, "D2");
});

test("range clips a trip that crosses the period end", () => {
  const w = buildWorklog({ driverName: "S", range: { start: "2026-10-25", end: "2026-10-25" }, tz: TZ, title: "Weekly", trips: [trip({})], purchases: [] });
  assert.equal(w.days.length, 1);
  assert.equal(w.summary.hours, 9);
});

test("render: subject, sections, mobile and print rules", () => {
  const w = buildWorklog({ driverName: "A <b>", range: { start: "2026-10-25", end: "2026-10-26" }, tz: TZ, title: "Weekly", trips: [trip({})], purchases: [] });
  assert.equal(worklogSubject(w), "Weekly, DROP Report");
  const html = renderWorklogBody(w);
  assert.match(html, /A &lt;b&gt;/);
  assert.match(html, /MIDNIGHT/);
  assert.match(html, /@page/);
  assert.match(html, /D2\/MT\/D2/);
  assert.match(html, /15,456 Ggal/);
  assert.doesNotMatch(renderWorklogBody(w, { mode: "condensed" }), /MIDNIGHT/);
});

test("a safety meeting counts as on duty: added to the day, with or without the electronic log", () => {
  const range = { start: "2026-10-27", end: "2026-10-27" };
  // No trip, no log: the meeting alone makes a worked day.
  const only = buildWorklog({ driverName: "S", range, tz: TZ, title: "W", trips: [], purchases: [], meetingHours: { "2026-10-27": 1.5 } });
  assert.equal(only.days.length, 1);
  assert.equal(only.days[0].worked, 1.5);
  assert.equal(only.days[0].meeting, 1.5);
  // With the log, the meeting adds to the log's on-duty time (overlap was already removed upstream).
  const logged = buildWorklog({ driverName: "S", range, tz: TZ, title: "W", trips: [], purchases: [], dutyHours: { "2026-10-27": 6 }, meetingHours: { "2026-10-27": 1 } });
  assert.equal(logged.days[0].worked, 7);
  assert.equal(logged.summary.worked, 7);
  // No meeting: nothing changes.
  const none = buildWorklog({ driverName: "S", range, tz: TZ, title: "W", trips: [], purchases: [], dutyHours: { "2026-10-27": 6 } });
  assert.equal(none.days[0].worked, 6);
  assert.equal(none.days[0].meeting, 0);
});
