import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSavedAt, hasRealCompPlan, parsePlanPayload, snapshotHasContent } from "./planSlotStorage.ts";

test("parsePlanPayload passes a current-format snapshot through untouched", () => {
  const snap = { v: 1, savedAt: 5, name: "A", activeSlot: 2, compPlan: { 1: { empty: false, productId: "p" } } };
  assert.deepEqual(parsePlanPayload(JSON.stringify(snap), "t", "c"), snap);
});

test("parsePlanPayload rebuilds a legacy payload with the fallback scope", () => {
  const out = parsePlanPayload(JSON.stringify({ tempF: 70, compPlan: { 1: { empty: true, productId: "" } } }), "term", "combo");
  assert.equal(out.terminalId, "term");
  assert.equal(out.comboId, "combo");
  assert.equal(out.tempF, 70);
});

test("parsePlanPayload returns null for empty or broken input", () => {
  assert.equal(parsePlanPayload(null, "t", "c"), null);
  assert.equal(parsePlanPayload("{nope", "t", "c"), null);
});

test("compareSavedAt orders by numeric savedAt and by ISO date", () => {
  assert.ok(compareSavedAt({ savedAt: 10 }, { savedAt: 5 }) > 0);
  assert.ok(compareSavedAt({ savedAt: 1 }, { savedAt: 5 }) < 0);
  assert.ok(compareSavedAt({ savedAtISO: "2026-01-02T00:00:00Z" }, { savedAtISO: "2026-01-01T00:00:00Z" }) > 0);
  assert.equal(compareSavedAt({}, {}), 0);
});

test("a snapshot has content only when some compartment holds a product", () => {
  assert.equal(snapshotHasContent({ v: 1, compPlan: { 1: { empty: false, productId: "p" } } }), true);
  assert.equal(snapshotHasContent({ v: 1, compPlan: { 1: { empty: true, productId: "p" } } }), false);
  assert.equal(snapshotHasContent({ v: 1, compPlan: {} }), false);
  assert.equal(snapshotHasContent(null), false);
});

test("hasRealCompPlan ignores the version field", () => {
  assert.equal(hasRealCompPlan({ version: 0, compPlan: { 2: { empty: false, productId: "x" } } }), true);
  assert.equal(hasRealCompPlan({ compPlan: { 2: { empty: false, productId: "" } } }), false);
});
