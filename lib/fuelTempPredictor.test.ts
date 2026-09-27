import { test } from "node:test";
import assert from "node:assert/strict";
import { predictFuelTempNow, type AmbientPoint } from "./fuelTempPredictor.ts";

// Tampa, 2026-09-27 ~5pm EDT (21:05 UTC) -- the live case that exposed the
// seed bug: sparse history whose oldest point is an overnight low.
const TAMPA = { lat: 27.95, lon: -82.46 };
const NOW = Math.floor(Date.UTC(2026, 8, 27, 21, 5) / 1000);
const h = (hoursAgo: number, tempF: number): AmbientPoint => ({ ts: NOW - hoursAgo * 3600, tempF });

// 6 sparse points over 30h, oldest a 74F pre-dawn reading, big gaps between.
const SPARSE: AmbientPoint[] = [h(29, 74), h(21, 88), h(19, 86), h(8, 77), h(1, 84), h(0, 83.66)];

test("sparse history no longer pins the prediction to the oldest (night-low) point", () => {
  const r = predictFuelTempNow(SPARSE, 83.66, NOW, TAMPA.lat, TAMPA.lon, { cloudPct: 40 });
  // Old model: seeded at 74 and barely moved (~75-77). New: near the ~82 mean.
  assert.ok(r.predictedFuelTempF > 80, `got ${r.predictedFuelTempF}`);
  assert.ok(r.predictedFuelTempF < 88, `got ${r.predictedFuelTempF}`);
});

test("daily-mean seed is used when supplied", () => {
  const r = predictFuelTempNow(SPARSE, 83.66, NOW, TAMPA.lat, TAMPA.lon, { cloudPct: 100, seedTempF: 84 });
  assert.equal(r.debug?.seedFuelTempF, 84);
  assert.ok(Math.abs(r.predictedFuelTempF - 83) < 3, `got ${r.predictedFuelTempF}`);
});

test("steady ambient converges to ambient (plus nothing at night)", () => {
  const night = Math.floor(Date.UTC(2026, 8, 27, 7, 0) / 1000); // 3am EDT, sun down
  const pts: AmbientPoint[] = [0, 6, 12, 18, 24, 30].map((a) => ({ ts: night - a * 3600, tempF: 80 })).reverse();
  const r = predictFuelTempNow(pts, 80, night, TAMPA.lat, TAMPA.lon, { seedTempF: 80 });
  assert.equal(r.predictedFuelTempF, 80);
});

test("still lags a sudden jump rather than snapping to it", () => {
  const pts: AmbientPoint[] = [h(30, 70), h(24, 70), h(12, 70), h(2, 70), h(0, 95)];
  const r = predictFuelTempNow(pts, 95, NOW, TAMPA.lat, TAMPA.lon, { cloudPct: 100, seedTempF: 70 });
  assert.ok(r.predictedFuelTempF < 75, `got ${r.predictedFuelTempF}`);
});

test("morning-only polling (common for early loads) doesn't drag the afternoon prediction to the morning low", () => {
  const pts: AmbientPoint[] = [h(14, 74.5), h(13, 74), h(12.5, 74.2), h(12, 75), h(11, 76), h(0, 83.66)];
  const r = predictFuelTempNow(pts, 83.66, NOW, TAMPA.lat, TAMPA.lon, { cloudPct: 40, seedTempF: 83.5 });
  assert.ok(r.predictedFuelTempF > 81, `got ${r.predictedFuelTempF}`);
});
