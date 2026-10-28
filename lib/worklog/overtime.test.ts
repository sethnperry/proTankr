import test from "node:test";
import assert from "node:assert/strict";
import { computeOvertime } from "./overtime.ts";

const wk = (hrs: number[]) => hrs.map((h, i) => ({ date: `2026-10-${String(21 + i).padStart(2, "0")}`, hours: h }));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test("federal: only hours over 40 in the week are overtime", () => {
  const r = computeOvertime(wk([10, 10, 10, 10, 10, 0, 0]), "federal", "2026-10-21");
  near(r.regular, 40); near(r.overtime, 10); near(r.double, 0);
});
test("daily 8: a 10-hour day is 8 regular and 2 overtime", () => {
  const r = computeOvertime(wk([10, 0, 0, 0, 0, 0, 0]), "daily8", "2026-10-21");
  near(r.regular, 8); near(r.overtime, 2);
});
test("california: 13 hours is 8 regular, 4 overtime, 1 double", () => {
  const r = computeOvertime(wk([13, 0, 0, 0, 0, 0, 0]), "california", "2026-10-21");
  near(r.regular, 8); near(r.overtime, 4); near(r.double, 1);
});
test("daily overtime is not counted again by the weekly 40", () => {
  const r = computeOvertime(wk([10, 10, 10, 10, 0, 0, 0]), "daily8", "2026-10-21");
  near(r.regular, 32); near(r.overtime, 8);
});
test("california seventh day: first 8 overtime, rest double", () => {
  const r = computeOvertime(wk([6, 6, 6, 6, 6, 6, 10]), "california", "2026-10-21");
  near(r.regular, 36); near(r.overtime, 8); near(r.double, 2);
});
test("two weeks are counted separately", () => {
  const days = [...wk([9, 9, 9, 9, 9, 0, 0]), { date: "2026-10-28", hours: 9 }, { date: "2026-10-29", hours: 9 }];
  const r = computeOvertime(days, "federal", "2026-10-21");
  near(r.regular, 58); near(r.overtime, 5);
});
