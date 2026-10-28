import test from "node:test";
import assert from "node:assert/strict";
import { isLongRange, lastFinishedPeriod, periodOptions } from "./periodOptions.ts";

// Wednesday through Tuesday, like Gemini.
const S = { type: "weekly" as const, anchor: "2026-10-21" }; // a Wednesday

test("weekly Wed-Tue periods and the finished one", () => {
  const p = lastFinishedPeriod(S, "2026-10-29"); // Thursday
  assert.equal(p?.start, "2026-10-21");
  assert.equal(p?.end, "2026-10-27");
  const opts = periodOptions(S, "2026-10-29");
  assert.match(opts[0].label, /^This period/);
  assert.equal(opts[0].start, "2026-10-28");
  assert.match(opts[1].label, /^Last period \(10\/21 to 10\/27\)/);
  assert.ok(opts.some((o) => o.id === "y:ytd" && o.start === "2026-01-01" && o.end === "2026-10-29"));
});
test("calendar ranges exist without a period setting", () => {
  const o = periodOptions(null, "2026-03-05");
  assert.deepEqual(o.map((x) => x.id), ["m:this", "m:last", "y:ytd", "y:last"]);
  assert.equal(o[1].start, "2026-02-01"); assert.equal(o[1].end, "2026-02-28");
});
test("long range", () => { assert.equal(isLongRange("2026-01-01", "2026-10-29"), true); assert.equal(isLongRange("2026-10-01", "2026-10-31"), false); });
