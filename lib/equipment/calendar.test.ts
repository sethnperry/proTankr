import test from "node:test";
import assert from "node:assert/strict";
import { addMonthsIso, monthGrid } from "./calendar.ts";

test("adding months clamps the day and rolls the year", () => {
  assert.equal(addMonthsIso("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsIso("2027-01-31", 1), "2027-02-28");
  assert.equal(addMonthsIso("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsIso("2026-11-15", 3), "2027-02-15");
  assert.equal(addMonthsIso("2026-03-10", 12), "2027-03-10");
  assert.equal(addMonthsIso("2026-03-10", -3), "2025-12-10");
});

test("month grid is six Sunday-first weeks and marks the month's own days", () => {
  const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(g.length, 6);
  assert.ok(g.every((w) => w.length === 7));
  assert.equal(g[0][4].iso, "2026-10-01");
  assert.equal(g[0][0].inMonth, false);
  assert.equal(g.flat().filter((c) => c.inMonth).length, 31);
});
