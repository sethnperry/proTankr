import test from "node:test";
import assert from "node:assert/strict";
import { hosPreview, dayMinus, fmtHours } from "./hosPreview.ts";
import { coverage, levelFor, barBox, filterSignups, areasOf, normArea } from "./coverage.ts";

const H = 3600_000;
const days = (mins: number[], end = "2026-11-24") => mins.map((m, i) => ({ date: dayMinus(end, mins.length - 1 - i), minutes: m }));

test("55 hours used leaves 15; a 10 hour block leaves 5 and the reset runs 34 hours from its end", () => {
  // 55h spread over the 8 days ending today (2026-11-24)
  const recap = days([480, 420, 480, 420, 360, 480, 360, 300]); // 3300 min = 55h
  const start = Date.parse("2026-11-25T12:00:00Z"); // tomorrow; the oldest day (11-17) is out of that 8-day window
  const p = hosPreview({ recapDays: recap, startMs: start, endMs: start + 10 * H, tz: "UTC" });
  assert.equal(p.blockMin, 600);
  // window ending 11-25 covers 11-18..11-25: 3300 - 480 (the 11-17 day) = 2820 used -> 1380 available
  assert.equal(p.availableAtStartMin, 4200 - 2820);
  assert.equal(p.shortByMin, 0);
  assert.equal(p.runsOutAtMs, null);
  assert.equal(p.restartDoneAtMs, start + 10 * H + 34 * H);
  assert.equal(p.leftAfterMin, 1380 - 600);
});
test("a block bigger than the cycle runs out and the reset counts from then", () => {
  const recap = days([600, 600, 600, 600, 600, 600, 600, 0]); // 70h - 0 today... 4200 used by 11-23 and earlier
  const start = Date.parse("2026-11-24T20:00:00Z");
  const p = hosPreview({ recapDays: recap, startMs: start, endMs: start + 6 * H, tz: "UTC" });
  assert.ok(p.runsOutAtMs != null);
  assert.ok(p.shortByMin > 0);
  assert.equal(p.restartDoneAtMs, (p.runsOutAtMs as number) + 34 * H);
});
test("over 14 hours is flagged", () => {
  const start = Date.parse("2026-11-25T00:00:00Z");
  assert.equal(hosPreview({ recapDays: [], startMs: start, endMs: start + 15 * H, tz: "UTC" }).over14, true);
  assert.equal(fmtHours(930), "15:30");
});

const s = (id: string, u: string, a: number, b: number, w?: string) => ({ signup_id: id, user_id: u, start_at: new Date(a).toISOString(), end_at: new Date(b).toISOString(), withdrawn_at: w ?? null });
test("coverage counts each driver once per bucket and grades against the requirement", () => {
  const t0 = Date.parse("2026-11-25T00:00:00Z");
  const sg = [s("1", "a", t0, t0 + 6 * H), s("2", "a", t0 + 2 * H, t0 + 4 * H), s("3", "b", t0 + 3 * H, t0 + 9 * H)];
  const c = coverage(sg, t0, 12, 3, 2);
  assert.deepEqual(c.map((x) => x.count), [1, 2, 1, 0]);
  assert.deepEqual(c.map((x) => x.level), ["short", "full", "short", "empty"]);
  assert.equal(levelFor(5, null), "none");
});
test("bars clip to the chart and miss when outside", () => {
  const t0 = Date.parse("2026-11-25T00:00:00Z");
  assert.deepEqual(barBox(s("1", "a", t0 - 6 * H, t0 + 6 * H), t0, 24), { left: 0, width: 0.25 });
  assert.equal(barBox(s("1", "a", t0 + 30 * H, t0 + 31 * H), t0, 24), null);
});
test("filters: region, local areas (trim and case ignored), withdrawn and past windows", () => {
  const now = Date.parse("2026-11-25T10:00:00Z");
  const d = new Map([["a", { user_id: "a", name: "A", region: "SE", local_area: "Tampa " }], ["b", { user_id: "b", name: "B", region: "SE", local_area: "Davenport" }], ["c", { user_id: "c", name: "C", region: "NE", local_area: "Tampa" }]]);
  const sg = [s("1", "a", now, now + H), s("2", "b", now, now + H), s("3", "c", now, now + H), s("4", "a", now - 5 * H, now - 4 * H), s("5", "a", now, now + H, "x")];
  assert.deepEqual(filterSignups(sg, d, { region: null, areas: null }, now).map((x) => x.signup_id), ["1", "2", "3"]);
  assert.deepEqual(filterSignups(sg, d, { region: "SE", areas: new Set([normArea("tampa")]) }, now).map((x) => x.signup_id), ["1"]);
  assert.deepEqual(areasOf([...d.values()], "SE").map((x) => x.label), ["Davenport", "Tampa"]);
});
