// app/planner/utils/apiBasis.test.ts
//
// Rules (driver spec, 2026-09-29):
//   no history -> product min; reading <= 7 days -> that reading as-is;
//   older -> terminal min (never product min once history exists).
// Color is age only: <=6h green, <=12h white, <=24h orange, older red.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveApiBasis, apiTierColor } from "./apiBasis.ts";

const NOW = Date.parse("2026-09-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();

const BASE = {
  alphaPerF: 0.0004,
  api60Ref: 40,
  apiMin: 35,
  minApiObserved: null as number | null,
  lastApi: null as number | null,
  lastTempF: null as number | null,
  lastApiUpdatedAt: null as string | null,
  tuned: null as { api: number; tempF: number } | null,
  nowMs: NOW,
};

test("tuned reading wins outright", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, lastApiUpdatedAt: hoursAgo(1), tuned: { api: 36.7, tempF: 92.6 } });
  assert.equal(b.tier, "tuned");
  assert.equal(b.displayApi, 36.7);
});

test("first load at a terminal (no history) uses product min and says so", () => {
  const b = resolveApiBasis({ ...BASE });
  assert.equal(b.displayApi, 35);
  assert.equal(b.api60, 35);
  assert.equal(b.tier, "low");
  assert.equal(b.hasHistory, false);
});

test("product min falls back to api_60 when api_min isn't seeded", () => {
  const b = resolveApiBasis({ ...BASE, apiMin: null });
  assert.equal(b.displayApi, 40);
});

test("the Marathon case: a day-old reading is used as-is, not the terminal min", () => {
  // 60.55 last night, terminal min 59.5 -> plan on 60.55 (orange/red color only).
  const b = resolveApiBasis({ ...BASE, apiMin: 55, lastApi: 60.55, lastTempF: 60, minApiObserved: 59.5, lastApiUpdatedAt: hoursAgo(20) });
  assert.equal(b.displayApi, 60.55);
  assert.equal(b.api60, 60.55);
  assert.equal(b.tier, "medium");
  assert.equal(b.hasHistory, true);
});

test("a 6-day-old reading is still used as-is (red)", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, minApiObserved: 33, lastApiUpdatedAt: hoursAgo(6 * 24) });
  assert.equal(b.displayApi, 42);
  assert.equal(b.tier, "low");
});

test("exactly 7 days old is still the reading (boundary inclusive)", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, minApiObserved: 33, lastApiUpdatedAt: hoursAgo(7 * 24) });
  assert.equal(b.displayApi, 42);
});

test("older than 7 days drops to the terminal min, not the stale reading", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 45, lastTempF: 80, minApiObserved: 33, lastApiUpdatedAt: hoursAgo(8 * 24) });
  assert.equal(b.displayApi, 33);
  assert.equal(b.api60, 33);
  assert.equal(b.tier, "low");
});

test("older than 7 days never goes back to product min when the terminal ran lighter", () => {
  const b = resolveApiBasis({ ...BASE, apiMin: 55, lastApi: 59.5, lastTempF: 60, minApiObserved: 59.5, lastApiUpdatedAt: hoursAgo(10 * 24) });
  assert.equal(b.displayApi, 59.5);
});

test("terminal min is the lower of recorded min and the last reading", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 36.4, lastTempF: 60, minApiObserved: 36.8, lastApiUpdatedAt: hoursAgo(9 * 24) });
  assert.equal(b.displayApi, 36.4);
});

test("a recorded min with no last reading counts as history", () => {
  const b = resolveApiBasis({ ...BASE, minApiObserved: 38 });
  assert.equal(b.displayApi, 38);
  assert.equal(b.hasHistory, true);
});

test("a reading with no timestamp falls to the terminal min", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, minApiObserved: 39 });
  assert.equal(b.displayApi, 39);
});

test("used reading is back-corrected to 60F for density", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 85, lastApiUpdatedAt: hoursAgo(2) });
  assert.equal(b.displayApi, 42);
  assert.ok(Math.abs(b.api60 - (42 + 0.0004 * 25)) < 1e-9);
});

test("color tiers by age: <=6h green, <=12h white, <=24h orange, older red", () => {
  const tierAt = (h: number) => resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, lastApiUpdatedAt: hoursAgo(h) }).tier;
  assert.equal(tierAt(1), "high");
  assert.equal(tierAt(6), "high");
  assert.equal(tierAt(7), "recent");
  assert.equal(tierAt(12), "recent");
  assert.equal(tierAt(13), "medium");
  assert.equal(tierAt(24), "medium");
  assert.equal(tierAt(25), "low");
  assert.equal(apiTierColor("high"), "#4ade80");
  assert.equal(apiTierColor("recent"), "#ffffff");
  assert.equal(apiTierColor("medium"), "#fb923c");
  assert.equal(apiTierColor("low"), "#f87171");
  assert.equal(apiTierColor("tuned"), "#ffffff");
});
