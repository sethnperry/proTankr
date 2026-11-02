import { test } from "node:test";
import assert from "node:assert/strict";
import { claimProblem, classifyStops, classifyTrail, dayBounds, dayCards, homeProblem, miles, perDiemColumns, recentDays, daysPerDriver, type PerDiemRow } from "./perDiem.ts";
import { toCsv } from "../reports/reportShell.ts";

const ocala = { lat: 29.19, lon: -82.14, radiusMiles: 50 };

test("distance: Ocala to Tampa is about 88 miles", () => {
  const d = miles({ lat: 29.19, lon: -82.14 }, { lat: 27.95, lon: -82.46 });
  assert.ok(d > 85 && d < 92, String(d));
});

test("a day is away when the truck went beyond the radius; the suggestion is where it ended", () => {
  const trail = [
    { lat: 29.2, lon: -82.1, at: "2026-11-03T12:00:00Z" },
    { lat: 28.5, lon: -81.4, at: "2026-11-03T16:00:00Z" },   // Orlando, about 65 mi
    { lat: 27.95, lon: -82.46, at: "2026-11-03T23:00:00Z" }, // Tampa
  ];
  const r = classifyTrail(trail, ocala);
  assert.equal(r.away, true);
  assert.equal(r.last?.at, "2026-11-03T23:00:00Z");
  assert.equal(classifyTrail([{ lat: 29.25, lon: -82.1, at: "x" }], ocala).away, false);
  assert.equal(classifyTrail([], ocala).away, false);
});

test("without GPS: a stop in another city makes it an away day; the last away stop is suggested", () => {
  const home = { city: "Ocala", state: "FL" };
  const r = classifyStops([{ city: "Ocala", state: "FL", at: "2026-11-03T10:00:00Z" }, { city: "Tampa", state: "fl", at: "2026-11-03T14:00:00Z" }, { city: "Miami", state: "FL", at: "2026-11-03T20:00:00Z" }], home);
  assert.deepEqual(r, { away: true, city: "Miami", state: "FL" });
  assert.equal(classifyStops([{ city: " ocala ", state: "FL", at: "2026-11-03T10:00:00Z" }], home).away, false);
  assert.equal(classifyStops([], home).away, false);
});

test("the driver's list: claimed first, then suggestions, home days, and days nobody knows about", () => {
  const cards = dayCards(["d4", "d3", "d2", "d1"],
    [{ day: "d4", city: "Tampa", state: "FL", source: "manual", status: "claimed" }, { day: "d2", city: "X", state: "FL", source: "app", status: "withdrawn" }],
    [{ day: "d3", away: true, city: "Orlando", state: "FL", source: "geotab", detail: "82 mi from home" }, { day: "d2", away: false, city: null, state: null, source: "geotab", detail: null }]);
  assert.deepEqual(cards.map((c) => c.kind), ["claimed", "suggested", "home", "unknown"]);
});

test("claiming needs a city and a two-letter state; home needs a sane radius", () => {
  assert.match(claimProblem("", "FL")!, /city/);
  assert.match(claimProblem("Tampa", "Florida")!, /two-letter/);
  assert.equal(claimProblem("Tampa", "fl"), null);
  assert.match(homeProblem("Ocala", "FL", 2)!, /Radius/);
});

test("local days and their bounds follow the driver's time zone", () => {
  const days = recentDays(Date.parse("2026-11-04T03:00:00Z"), "America/New_York", 3);
  assert.deepEqual(days, ["2026-11-03", "2026-11-02", "2026-11-01"]);
  assert.equal(dayBounds("2026-11-03", "America/New_York").fromIso, "2026-11-03T05:00:00.000Z");
});

test("the admin list reads per driver and counts only claimed days", () => {
  const rows: PerDiemRow[] = [
    { user_id: "u", day: "2026-11-03", city: "Tampa", state: "FL", source: "geotab", status: "claimed" },
    { user_id: "u", day: "2026-11-02", city: "Tampa", state: "FL", source: "manual", status: "withdrawn" },
  ];
  assert.equal(daysPerDriver(rows).get("u"), 1);
  assert.ok(toCsv(perDiemColumns(() => "Seth"), rows).includes("11/3/26,Seth,\"Tampa, FL\",GPS"));
});
