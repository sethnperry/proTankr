import test from "node:test";
import assert from "node:assert/strict";
import { gaugeTiles, fuelTone } from "./readoutLayout.ts";

test("every field reported: four tiles with units", () => {
  const t = gaugeTiles({ odometerMi: 295301.4, engineHours: 8120.46, fuelLevelPct: 62, speedMph: 58, bearingDeg: 92 });
  assert.deepEqual(t.map((x) => x.key), ["odometer", "engine", "fuel", "motion"]);
  assert.equal(t[0].unit, "mi");
  assert.equal(t[1].value, "8,120.5");
  assert.equal(t[2].bar, 62);
  assert.equal(t[3].sub, "heading E");
});

test("missing fields read as a dash, not zero", () => {
  const t = gaugeTiles({});
  assert.ok(t.every((x) => x.value === "—" && x.tone === "muted"));
});

test("fuel tone thresholds and stopped state", () => {
  assert.equal(fuelTone(10), "bad");
  assert.equal(fuelTone(25), "warn");
  assert.equal(fuelTone(60), "good");
  assert.equal(gaugeTiles({ speedMph: 0 })[3].value, "Stopped");
});
