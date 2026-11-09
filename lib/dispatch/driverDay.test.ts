import test from "node:test";
import assert from "node:assert/strict";
import { driverDay, driverDays, type DayItem } from "./driverDay.ts";

const H = 3600000;
const T0 = Date.UTC(2026, 10, 8, 22, 0); // 10 pm
const it = (id: string, kind: DayItem["kind"], h: number, len = 3): DayItem => ({ id, kind, startMs: T0 + h * H, endMs: T0 + (h + len) * H });

test("a day that starts before midnight and ends after it stays together", () => {
  const d = driverDay([it("a", "done", 0), it("b", "live", 3), it("c", "planned", 7)], T0 + 4 * H)!;
  assert.deepEqual(d.items.map((x) => x.id), ["a", "b", "c"]);
  assert.equal(d.startMs, T0);
});
test("a 10 hour gap ends the day; the live day wins over yesterday", () => {
  const d = driverDay([it("old", "done", -30), it("a", "live", 0)], T0 + H)!;
  assert.deepEqual(d.items.map((x) => x.id), ["a"]);
});
test("with nothing live, the day around now is chosen, else the next one", () => {
  const d = driverDay([it("old", "done", -30), it("next", "planned", 20)], T0)!;
  assert.deepEqual(d.items.map((x) => x.id), ["next"]);
});
test("a live trip with no end time still anchors its day", () => {
  const d = driverDay([{ id: "x", kind: "live", startMs: T0, endMs: null }, it("p", "planned", 5)], T0 + 2 * H)!;
  assert.equal(d.items.length, 2);
});
test("no trips, no day", () => assert.equal(driverDay([], T0), null));

test("days are labeled; a finished day inside its rest is still Today with a reset time", () => {
  const days = driverDays([it("y", "done", -20), it("t", "done", -4, 3)], T0)!;
  assert.deepEqual(days.map((d) => d.label), ["Yesterday", "Today"]);
  assert.equal(days[1].resetAtMs, T0 - 1 * H + 10 * H);
});
test("after the reset the finished day is Yesterday and tomorrow's trips come next", () => {
  const days = driverDays([it("a", "done", -20), it("b", "planned", 30)], T0);
  assert.deepEqual(days.map((d) => d.label), ["Yesterday", "Tomorrow"]);
});
test("a live day gets Yesterday before and Tomorrow after", () => {
  const days = driverDays([it("a", "done", -30), it("b", "live", 0), it("c", "planned", 40)], T0 + H);
  assert.deepEqual(days.map((d) => d.label), ["Yesterday", "Today", "Tomorrow"]);
});
