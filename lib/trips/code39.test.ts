// lib/trips/code39.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE39_CHARS, code39Bars, code39Pattern, code39Widths, ptdCode } from "./code39.ts";

test("every pattern is 9 elements with exactly 3 wide, all distinct", () => {
  const all = [...CODE39_CHARS, "*"].map((c) => code39Pattern(c)!);
  for (const p of all) {
    assert.equal(p.length, 9);
    assert.equal([...p].filter((b) => b === "1").length, 3, p);
  }
  assert.equal(new Set(all).size, all.length);
});

test("ptd code from a trip id", () => {
  assert.equal(ptdCode("3f2a9c1e-77aa-4b2c-9d0e-123456789abc"), "PT-3F2A9C1E");
});

test("widths: start/stop wrapped, gaps between characters", () => {
  const w = code39Widths("A");
  // *, gap, A, gap, *  => 9 + 1 + 9 + 1 + 9
  assert.equal(w.length, 29);
  assert.equal(w[0], 1); // '*' starts with a narrow bar
  assert.throws(() => code39Widths("a*b"));
  assert.throws(() => code39Widths("é"));
});

test("bars only on even elements; width sums", () => {
  const { bars, width } = code39Bars("PT-1");
  const widths = code39Widths("PT-1");
  assert.equal(width, widths.reduce((a, b) => a + b, 0));
  assert.equal(bars.length, Math.ceil(widths.length / 2));
});
