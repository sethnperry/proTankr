// app/planner/utils/apiBasis.test.ts
//
// Confidence-tier resolution for the API a planned load's density stands on.
// Tiers: tuned (the driver's own gauge/BOL entry, white -- not a system
// confidence rating), high (<=12h old network reading, green), medium
// (12-24h, a blended safer guess, amber), low (>24h old, or never observed
// here at all, red). Safety property: whenever a reading isn't fresh enough
// to trust outright, density must fall back toward the HEAVIEST value
// available (lower API), so a stale/unknown reading can only make the plan
// more conservative, never lighter.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveApiBasis, apiTierColor } from "./apiBasis.ts";

const BASE = {
  alphaPerF: 0.0004,
  api60Ref: 40,
  apiMin: 35,
  minApiObserved: null as number | null,
  lastApi: null as number | null,
  lastTempF: null as number | null,
  lastApiUpdatedAt: null as string | null,
  tuned: null as { api: number; tempF: number } | null,
  nowMs: Date.parse("2026-09-08T12:00:00Z"),
};

test("tuned reading wins outright and is its own tier 'tuned' (not 'high')", () => {
  const b = resolveApiBasis({ ...BASE, tuned: { api: 36.7, tempF: 92.6 } });
  assert.equal(b.tier, "tuned");
  assert.equal(b.displayApi, 36.7);
});

test("reading updated within 12h is tier 'high', used as-is", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 80, lastApiUpdatedAt: "2026-09-08T01:00:00Z" });
  assert.equal(b.tier, "high");
  assert.equal(b.displayApi, 42);
});

test("reading exactly 12h old is still 'high' (boundary is inclusive)", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 80, lastApiUpdatedAt: "2026-09-08T00:00:00Z" });
  assert.equal(b.tier, "high");
});

test("reading updated 18h ago is tier 'medium', blended between the reading and the terminal floor", () => {
  const b = resolveApiBasis({
    ...BASE,
    lastApi: 42, lastTempF: 60, lastApiUpdatedAt: "2026-09-07T18:00:00Z",
    minApiObserved: 30,
  });
  assert.equal(b.tier, "medium");
  // lastApi60 (60F observed temp -> no back-correction needed) = 42; floor = min(30, 35) = 30.
  // Blended = (42 + 30) / 2 = 36 -- strictly between the reading and the floor.
  assert.equal(b.api60, 36);
  assert.equal(b.displayApi, 36);
});

test("medium tier falls back to the reading itself as its own floor when nothing's been observed here", () => {
  // No minApiObserved -> terminalFloor collapses to apiMin (35), still used as the floor.
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, lastApiUpdatedAt: "2026-09-07T18:00:00Z" });
  assert.equal(b.tier, "medium");
  assert.equal(b.api60, (42 + 35) / 2);
});

test("reading exactly 24h old is still 'medium' (boundary is inclusive)", () => {
  const b = resolveApiBasis({ ...BASE, lastApi: 42, lastTempF: 60, lastApiUpdatedAt: "2026-09-07T12:00:00Z" });
  assert.equal(b.tier, "medium");
});

test("reading older than 24h is tier 'low', falls back to the terminal floor -- NOT the stale reading", () => {
  const b = resolveApiBasis({
    ...BASE,
    lastApi: 45, lastTempF: 80, lastApiUpdatedAt: "2026-08-29T12:00:00Z",
    minApiObserved: 33,
  });
  assert.equal(b.tier, "low");
  assert.equal(b.displayApi, 33);
  assert.notEqual(b.displayApi, 45); // the stale reading is NOT used
});

test("never observed here at all -> tier 'low' at the terminal floor", () => {
  // minObserved 33 is heavier (lower) than apiMin 35 -> use 33.
  const heavy = resolveApiBasis({ ...BASE, minApiObserved: 33 });
  assert.equal(heavy.tier, "low");
  assert.equal(heavy.displayApi, 33);
  // minObserved 38 is LIGHTER than apiMin 35 -> stay at 35 for safety.
  const safe = resolveApiBasis({ ...BASE, minApiObserved: 38 });
  assert.equal(safe.tier, "low");
  assert.equal(safe.displayApi, 35, "must not pick a lighter fallback than the product minimum");
});

test("never observed + no terminal minimum -> tier 'low' at the product's published minimum", () => {
  const b = resolveApiBasis({ ...BASE });
  assert.equal(b.tier, "low");
  assert.equal(b.displayApi, 35);
});

test("falls back to api_60 when the product's published minimum is missing", () => {
  const b = resolveApiBasis({ ...BASE, apiMin: null });
  assert.equal(b.tier, "low");
  assert.equal(b.displayApi, 40);
});

test("tier colors: white for the driver's own tuned entry, then the temp confidence palette", () => {
  assert.equal(apiTierColor("tuned"), "#ffffff");
  assert.equal(apiTierColor("high"), "#4ade80");
  assert.equal(apiTierColor("medium"), "#fbbf24");
  assert.equal(apiTierColor("low"), "#f87171");
});
