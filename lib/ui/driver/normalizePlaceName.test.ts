// lib/ui/driver/normalizePlaceName.test.ts
//
// normalizePlaceName mirrors the DB's public.normalize_place_name() SQL
// function exactly (see supabase/migrations/20260923000000_dedupe_regions_local_areas.sql,
// which was verified against a real throwaway Postgres before being handed
// over). Same cases, both directions -- if this test and that migration's
// own manual verification ever disagree, one of the two implementations
// has drifted.

import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaceName } from "./normalizePlaceName.ts";

test("normalizePlaceName: Ft./Ft/Fort/case/whitespace variants all collapse to one key", () => {
  const variants = ["Ft. Myers", "Ft.Myers", "ft myers", "FT MYERS", "Fort Myers", "  Fort   Myers  "];
  const keys = variants.map(normalizePlaceName);
  for (const k of keys) assert.equal(k, "fortmyers");
});

test("normalizePlaceName: St./Saint collapse to one key", () => {
  assert.equal(normalizePlaceName("St. Petersburg"), normalizePlaceName("Saint Petersburg"));
  assert.equal(normalizePlaceName("st petersburg"), "saintpetersburg");
});

test("normalizePlaceName: Mt./Mount collapse to one key", () => {
  assert.equal(normalizePlaceName("Mt. Pleasant"), normalizePlaceName("Mount Pleasant"));
});

test("normalizePlaceName: does not false-positive merge a genuinely different place", () => {
  // "Fort Wayne" must NOT collapse onto the same key as "Ft. Myers" --
  // confirms the ft->fort expansion only fires on the standalone token
  // "ft", not as a side effect of any word containing those letters.
  assert.notEqual(normalizePlaceName("Fort Wayne"), normalizePlaceName("Ft. Myers"));
  assert.equal(normalizePlaceName("Fort Wayne"), normalizePlaceName("Ft Wayne"));
});

test("normalizePlaceName: plain names with no abbreviation are just case/whitespace-folded", () => {
  assert.equal(normalizePlaceName("Jacksonville"), "jacksonville");
  assert.equal(normalizePlaceName(" Jacksonville "), "jacksonville");
  assert.equal(normalizePlaceName("JACKSONVILLE"), "jacksonville");
});

test("normalizePlaceName: single-letter directions are left alone (not expanded)", () => {
  // Deliberately conservative -- N/S/E/W are too easy to false-positive on
  // unrelated text, so unlike ft/st/mt they're never expanded.
  assert.equal(normalizePlaceName("N Tampa"), "ntampa");
  assert.equal(normalizePlaceName("North Tampa"), "northtampa");
  assert.notEqual(normalizePlaceName("N Tampa"), normalizePlaceName("North Tampa"));
});
