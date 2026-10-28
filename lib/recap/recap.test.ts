import test from "node:test";
import assert from "node:assert/strict";
import { dailyHours } from "./dailyHours.ts";
import { buildRecap, tripMiles, type RecapTrip } from "./buildRecap.ts";
import { renderRecapHtml, renderPayPeriodNudgeHtml } from "./renderRecapEmail.ts";

const TZ = "America/New_York";
const log = (t: string, status: string) => ({ dateTime: t, status, eventType: 1, state: "Active", origin: "Automatic" });

test("daily hours split drive and on duty at local midnight", () => {
  // 08:00-12:00 driving, 12:00-13:00 on duty, EDT (UTC-4)
  const logs = [log("2026-10-26T12:00:00Z", "D"), log("2026-10-26T16:00:00Z", "ON"), log("2026-10-26T17:00:00Z", "OFF")];
  const h = dailyHours(logs, TZ, "2026-10-25", "2026-10-27", Date.parse("2026-10-27T12:00:00Z"));
  assert.equal(h.length, 3);
  const d = h.find((x) => x.date === "2026-10-26")!;
  assert.equal(d.driveMin, 240);
  assert.equal(d.onDutyMin, 60);
  assert.equal(h[0].driveMin, 0);
});

const trip = (o: Partial<RecapTrip>): RecapTrip => ({ tripId: "t", orders: ["4816492"], startedAt: "2026-10-26T14:00:00Z", completedAt: "2026-10-26T20:00:00Z", beginMiles: 1000, endMiles: 1184, gallons: 8000, stops: [], ...o });

test("recap lines trips, hours and purchases up by day", () => {
  const r = buildRecap({
    driverName: "Seth", period: { start: "2026-10-25", end: "2026-10-27" }, tz: TZ,
    hours: [{ date: "2026-10-25", driveMin: 0, onDutyMin: 0 }, { date: "2026-10-26", driveMin: 240, onDutyMin: 60 }, { date: "2026-10-27", driveMin: 0, onDutyMin: 0 }],
    trips: [trip({})], purchases: [{ at: "2026-10-26T15:00:00Z", store: "Loves", place: "Davenport, FL", gallons: 100, kind: "cash", amount: 380.5 }],
  });
  assert.equal(r.totals.miles, 184);
  assert.equal(r.totals.driveMin, 240);
  assert.equal(r.totals.onDutyMin, 300);
  assert.equal(r.totals.spend, 380.5);
  assert.equal(r.days[1].trips, 1);
  assert.equal(r.days[1].spend, 380.5);
  assert.equal(tripMiles({ beginMiles: 5, endMiles: 99999 }), 0);
});

test("no telematics: hours are marked, not zero", () => {
  const r = buildRecap({ driverName: "A", period: { start: "2026-10-25", end: "2026-10-25" }, tz: TZ, hours: null, trips: [], purchases: [] });
  assert.equal(r.hasHours, false);
  assert.equal(r.totals.driveMin, null);
  assert.match(renderRecapHtml(r), /needs telematics/);
});

test("email html escapes and carries the sections", () => {
  const r = buildRecap({ driverName: "A <b>", period: { start: "2026-10-26", end: "2026-10-26" }, tz: TZ, hours: [{ date: "2026-10-26", driveMin: 60, onDutyMin: 0 }],
    trips: [trip({ stops: [{ kind: "pickup", name: "Kinder Morgan", arrivedAt: "2026-10-26T14:10:00Z", leftAt: "2026-10-26T15:00:00Z" }] })], purchases: [] });
  const html = renderRecapHtml(r);
  assert.match(html, /A &lt;b&gt;/);
  assert.match(html, /Trip details/);
  assert.match(html, /Kinder Morgan/);
  assert.match(html, /No purchases/);
  assert.match(renderPayPeriodNudgeHtml("Seth", "https://www.protankr.com/profile"), /set your pay period/);
});
