import test from "node:test";
import assert from "node:assert/strict";
import { applyCaps, mergePrefs, dropCap, emptyPrefs, sameCaps } from "./driverPrefs.ts";

const prefs = { caps: { 1: 4300 }, cg: 0.6, savedAt: 1 };
test("fills a compartment with no cap, limited by the trailer's own cap", () => {
  const plan: Record<number, { empty: boolean; productId: string; capOverride?: number | null }> = { 1: { empty: false, productId: "d2" }, 2: { empty: false, productId: "d2" } };
  const out = applyCaps(plan, prefs, { 1: 4200 });
  assert.equal(out[1].capOverride, 4200);
  assert.equal(out[2].capOverride, undefined);
});
test("keeps a cap the plan already has; a null cap is filled too", () => {
  const plan = { 1: { empty: false, productId: "d2", capOverride: 4000 } };
  assert.equal(applyCaps(plan, prefs, {}), plan);
  const nul: Record<number, { empty: boolean; productId: string; capOverride?: number | null }> = { 1: { empty: false, productId: "d2", capOverride: null } };
  assert.equal(applyCaps(nul, prefs, {})[1].capOverride, 4300);
});
test("empty compartments get nothing", () => {
  const plan = { 1: { empty: true, productId: "" } };
  assert.equal(applyCaps(plan, prefs, {}), plan);
});
test("merge keeps set caps and takes the CG; the trailer's lower cap is not remembered", () => {
  const m = mergePrefs(prefs, { 3: { capOverride: 3500.4 } }, 0.55, 9);
  assert.deepEqual(m.caps, { 1: 4300, 3: 3500 });
  assert.equal(m.cg, 0.55);
  const t = mergePrefs(prefs, { 1: { capOverride: 4200 } }, 0.6, 9, { 1: 4200 });
  assert.equal(t.caps[1], 4300);
  assert.ok(sameCaps(t, prefs));
  assert.ok(!sameCaps(emptyPrefs(), prefs));
});
test("dropCap removes one compartment", () => {
  assert.deepEqual(dropCap(prefs, 1, 5).caps, {});
});
