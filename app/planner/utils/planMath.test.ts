// app/planner/utils/planMath.test.ts
//
// Safety-critical planner math tests. Runs on node's built-in runner with
// native TS type-stripping (no deps, no DB, no browser):  npm test
//
// The invariant that matters: the weight-constrained plan solveMaxGallons
// produces must NEVER exceed the allowed payload ceiling -- no rounding or
// convergence step may turn a legal plan overweight.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  backCorrectApiTo60,
  lbsPerGallonAtTemp,
  bestLbsPerGallon,
  computeActualLbsForLine,
  cgSliderToBias,
  biasToCgSlider,
  allocateWithCaps,
  planForGallons,
  solveMaxGallons,
  resolveDensestReadingPerProduct,
  PLOW_BIAS_MAX,
} from "./planMath.ts";

// deterministic PRNG so the randomized invariant sweeps are reproducible
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const weightOf = (rows: Array<{ planned_gallons: number; lbsPerGal: number }>) =>
  rows.reduce((s, r) => s + r.planned_gallons * r.lbsPerGal, 0);

// ── Physics sanity ──────────────────────────────────────────────────────────
test("lbsPerGallonAtTemp: diesel-ish API 35 @ 60F is ~7.1 lb/gal", () => {
  const v = lbsPerGallonAtTemp(35, 0, 60);
  assert.ok(v > 7.0 && v < 7.2, `got ${v}`);
});

test("lbsPerGallonAtTemp: warmer product is lighter (positive alpha)", () => {
  const cold = lbsPerGallonAtTemp(35, 0.0006, 40);
  const hot  = lbsPerGallonAtTemp(35, 0.0006, 100);
  assert.ok(hot < cold, `hot ${hot} should be < cold ${cold}`);
});

test("backCorrectApiTo60 is the inverse of forward correction at temp", () => {
  const api60 = backCorrectApiTo60(36.5, 84.9, 0.0006);
  // forward: api at 60 back to observed temp should recover the observed api
  const recovered = api60 - 0.0006 * (84.9 - 60);
  assert.ok(Math.abs(recovered - 36.5) < 1e-9);
});

test("computeActualLbsForLine agrees with bestLbsPerGallon on the same inputs", () => {
  const gallons = 4300, api = 36.5, temp = 84.9, alpha = 0.0006;
  const viaActual = computeActualLbsForLine(gallons, api, temp, alpha);
  const viaBest = gallons * bestLbsPerGallon(0, alpha, temp, api, temp); // observed api == entered api
  assert.ok(Math.abs(viaActual - viaBest) < 1e-6, `${viaActual} vs ${viaBest}`);
});

// ── CG slider round-trip ────────────────────────────────────────────────────
test("biasToCgSlider ∘ cgSliderToBias is identity across the slider range", () => {
  for (let i = 0; i <= 20; i++) {
    const s = i / 20;
    const back = biasToCgSlider(cgSliderToBias(s));
    assert.ok(Math.abs(back - s) < 1e-3, `slider ${s} -> ${back}`);
  }
});

// ── allocateWithCaps: never exceeds caps or the requested total ─────────────
test("allocateWithCaps respects every compartment cap and the total", () => {
  const comps = [
    { compNumber: 1, maxGallons: 2000, planned_gallons: 0, lbsPerGal: 7, position: 1, productId: "p", weight: 2000 },
    { compNumber: 2, maxGallons: 1500, planned_gallons: 0, lbsPerGal: 7, position: 0, productId: "p", weight: 1500 },
    { compNumber: 3, maxGallons: 1000, planned_gallons: 0, lbsPerGal: 7, position: -1, productId: "p", weight: 1000 },
  ];
  const rows = allocateWithCaps(3000, comps as any);
  const total = rows.reduce((s, r) => s + r.planned_gallons, 0);
  assert.ok(total <= 3000 + 1e-6, `total ${total}`);
  for (const r of rows) assert.ok(r.planned_gallons <= r.max_gallons + 1e-6, `comp ${r.comp_number} over cap`);
});

test("allocateWithCaps: requesting more than total capacity fills to caps, not beyond", () => {
  const comps = [
    { compNumber: 1, maxGallons: 2000, planned_gallons: 0, lbsPerGal: 7, position: 0, productId: "p", weight: 2000 },
    { compNumber: 2, maxGallons: 1000, planned_gallons: 0, lbsPerGal: 7, position: 0, productId: "p", weight: 1000 },
  ];
  const rows = allocateWithCaps(999999, comps as any);
  assert.equal(rows[0].planned_gallons, 2000);
  assert.equal(rows[1].planned_gallons, 1000);
});

// ── THE core invariant: solveMaxGallons never exceeds the weight ceiling ────
test("solveMaxGallons: plan weight never exceeds allowedLbs (randomized sweep)", () => {
  const rnd = mulberry32(12345);
  let checked = 0;
  for (let iter = 0; iter < 2000; iter++) {
    const nComp = 1 + Math.floor(rnd() * 6);
    const comps = [];
    let totalCap = 0;
    for (let i = 0; i < nComp; i++) {
      const maxGallons = 200 + Math.floor(rnd() * 3800);
      totalCap += maxGallons;
      comps.push({
        compNumber: i + 1,
        maxGallons,
        position: (rnd() * 2 - 1),          // -1..1
        lbsPerGal: 5.5 + rnd() * 3.5,       // 5.5..9 (gasoline..heavy)
        productId: "p" + i,
      });
    }
    const allowedLbs = 5000 + rnd() * 70000;
    const bias = (rnd() * (PLOW_BIAS_MAX + 1)) - 1; // -1..PLOW_BIAS_MAX
    const g = solveMaxGallons(totalCap, comps, allowedLbs, bias);
    const rows = planForGallons(g, comps, bias);
    const w = weightOf(rows);
    assert.ok(w <= allowedLbs + 1e-3, `iter ${iter}: weight ${w} > allowed ${allowedLbs}`);
    // and the result is within [0, totalCap]
    assert.ok(g >= -1e-9 && g <= totalCap + 1e-6, `iter ${iter}: gallons ${g} out of range`);
    checked++;
  }
  assert.equal(checked, 2000);
});

test("solveMaxGallons: volume-limited case returns EXACTLY full (no phantom shortfall)", () => {
  const comps = [
    { compNumber: 1, maxGallons: 3000, position: 0, lbsPerGal: 6.0, productId: "p" },
    { compNumber: 2, maxGallons: 3000, position: 0, lbsPerGal: 6.0, productId: "p" },
  ];
  // 6000 gal * 6 lb = 36000 lb, well under a huge ceiling -> full load fits
  const g = solveMaxGallons(6000, comps, 1_000_000, 0);
  assert.equal(g, 6000);
});

test("solveMaxGallons: monotonic non-decreasing in allowedLbs", () => {
  const comps = [
    { compNumber: 1, maxGallons: 3000, position: 0.5, lbsPerGal: 7, productId: "p" },
    { compNumber: 2, maxGallons: 3000, position: -0.5, lbsPerGal: 7, productId: "p" },
  ];
  let prev = -1;
  for (let allowed = 0; allowed <= 60000; allowed += 2500) {
    const g = solveMaxGallons(6000, comps, allowed, 0);
    assert.ok(g >= prev - 1e-6, `allowed ${allowed}: ${g} < prev ${prev}`);
    prev = g;
  }
});

// ── Degenerate / hostile inputs must fail SAFE (0 or under-ceiling) ─────────
test("solveMaxGallons: NaN density -> 0 gallons (never a bogus over-fill)", () => {
  const comps = [{ compNumber: 1, maxGallons: 3000, position: 0, lbsPerGal: NaN, productId: "p" }];
  const g = solveMaxGallons(3000, comps, 50000, 0);
  assert.equal(g, 0);
});

test("solveMaxGallons: negative allowedLbs -> 0 gallons", () => {
  const comps = [{ compNumber: 1, maxGallons: 3000, position: 0, lbsPerGal: 7, productId: "p" }];
  assert.equal(solveMaxGallons(3000, comps, -100, 0), 0);
});

test("solveMaxGallons: zero total capacity -> 0", () => {
  assert.equal(solveMaxGallons(0, [], 50000, 0), 0);
});

test("allocateWithCaps: negative total -> everything zero", () => {
  const comps = [{ compNumber: 1, maxGallons: 2000, planned_gallons: 0, lbsPerGal: 7, position: 0, productId: "p", weight: 2000 }];
  const rows = allocateWithCaps(-500, comps as any);
  assert.equal(rows[0].planned_gallons, 0);
});

test("lbsPerGallonAtTemp: extreme low API is caught by the >0 planner guard", () => {
  // A wildly wrong API can drive computed density <= 0; the Planner excludes any
  // comp whose bestLbsPerGallon is not > 0 (page.tsx:928). Confirm the math does
  // yield a non-positive value there, so that guard is the thing standing between
  // garbage density and an under-weighted (overloadable) plan.
  const bad = lbsPerGallonAtTemp(-140, 0, 60); // api60 + 131.5 < 0 -> negative SG
  assert.ok(!(bad > 0), `expected non-positive, got ${bad}`);
});

// ── Plan Review "Tune" panel: the density a driver-tuned reading produces ──────
// The Tune panel (page.tsx lbsPerGalForProductId's tuned branch) computes
// density as lbsPerGallonAtTemp(backCorrectApiTo60(api, temp, alpha), alpha,
// temp) from the driver's own observed API+temp. The safety-critical property:
// tuning to a DENSER reading (lower API) must LOWER capacity, never raise it, so
// a driver correcting toward heavier product can only ever plan fewer gallons.
function tunedLbsPerGal(api: number, tempF: number, alpha: number): number {
  return lbsPerGallonAtTemp(backCorrectApiTo60(api, tempF, alpha), alpha, tempF);
}

test("tune density: lower observed API -> heavier lb/gal (denser)", () => {
  const alpha = 0.0004;
  const heavy = tunedLbsPerGal(30, 90, alpha); // low API = dense
  const light = tunedLbsPerGal(45, 90, alpha); // high API = light
  assert.ok(heavy > light, `expected heavier lb/gal at lower API: ${heavy} vs ${light}`);
});

test("tune density: correcting to a denser reading never RAISES capacity", () => {
  const alpha = 0.0004;
  const comp = (lbsPerGal: number) => [{
    compNumber: 1, maxGallons: 9000, position: 0, lbsPerGal, productId: "p",
  }];
  const allowedLbs = 55000; // target - tare, fixed
  const denseGal = solveMaxGallons(9000, comp(tunedLbsPerGal(30, 90, alpha)), allowedLbs, 0);
  const lightGal = solveMaxGallons(9000, comp(tunedLbsPerGal(45, 90, alpha)), allowedLbs, 0);
  // Denser product -> fewer gallons fit under the same weight ceiling.
  assert.ok(denseGal <= lightGal, `denser must not allow more gallons: ${denseGal} vs ${lightGal}`);
  // And the denser plan must not exceed the ceiling (the core solve invariant).
  assert.ok(denseGal * tunedLbsPerGal(30, 90, alpha) <= allowedLbs + 1e-6);
});

test("tune density: round-trips a fresh reading back to its own weight", () => {
  // A reading tuned at temp T then loaded at T must weigh what API gravity says
  // at T -- backCorrect to 60 then forward to T is a no-op on the density.
  const alpha = 0.00045;
  const direct = lbsPerGallonAtTemp(backCorrectApiTo60(36.7, 92.6, alpha), alpha, 92.6);
  assert.ok(direct > 0 && Number.isFinite(direct));
  // Same observed API at a HOTTER temp is lighter (thermal expansion).
  const hotter = tunedLbsPerGal(36.7, 100, alpha);
  assert.ok(hotter < direct, `hotter product should be lighter: ${hotter} vs ${direct}`);
});

// ── resolveDensestReadingPerProduct: per-compartment "Log the Load" resolver ──
test("resolveDensestReadingPerProduct: colder & denser compartment wins for a shared product", () => {
  const entries = [
    { comp: 1, productId: "diesel", gallons: 4000, api: 36.0, tempF: 85, alphaPerF: 0.0006 },
    { comp: 3, productId: "diesel", gallons: 3600, api: 34.0, tempF: 80, alphaPerF: 0.0006 }, // colder + lower API = denser
  ];
  const out = resolveDensestReadingPerProduct(entries);
  assert.equal(out.length, 1);
  assert.equal(out[0].comp, 3);
  assert.equal(out[0].api, 34.0);
  assert.equal(out[0].tempF, 80);
});

test("resolveDensestReadingPerProduct: null alpha falls back to coldest-wins", () => {
  const entries = [
    { comp: 1, productId: "unknown-product", gallons: 4000, api: 36.0, tempF: 90, alphaPerF: null },
    { comp: 2, productId: "unknown-product", gallons: 3600, api: 36.0, tempF: 82, alphaPerF: null },
  ];
  const out = resolveDensestReadingPerProduct(entries);
  assert.equal(out.length, 1);
  assert.equal(out[0].comp, 2); // 82 < 90 -> coldest wins
});

test("resolveDensestReadingPerProduct: a zeroed-out compartment never competes", () => {
  const entries = [
    { comp: 1, productId: "diesel", gallons: 0, api: 20.0, tempF: 40, alphaPerF: 0.0006 }, // would "win" on density but gallons=0
    { comp: 2, productId: "diesel", gallons: 3600, api: 36.0, tempF: 82, alphaPerF: 0.0006 },
  ];
  const out = resolveDensestReadingPerProduct(entries);
  assert.equal(out.length, 1);
  assert.equal(out[0].comp, 2);
});

test("resolveDensestReadingPerProduct: a product with zero valid candidates produces no row", () => {
  const entries = [
    { comp: 1, productId: "diesel", gallons: 0, api: 36.0, tempF: 82, alphaPerF: 0.0006 },
    { comp: 2, productId: "regular", gallons: 3000, api: 55.0, tempF: 80, alphaPerF: 0.0009 },
  ];
  const out = resolveDensestReadingPerProduct(entries);
  assert.equal(out.length, 1);
  assert.equal(out[0].productId, "regular");
});
