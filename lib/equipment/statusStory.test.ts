import test from "node:test";
import assert from "node:assert/strict";
import { inferShiftEnd, storyLine } from "./statusStoryLogic.ts";

test("shift-end inference: the one person whose shift ended just before", () => {
  const ev = [{ user_id: "kyle", occurred_at: "2026-11-14T05:00:06Z" }, { user_id: "jon", occurred_at: "2026-11-14T05:15:59Z" }];
  assert.equal(inferShiftEnd(ev, "2026-11-14T05:00:17Z"), "kyle");
  assert.equal(inferShiftEnd(ev, "2026-11-14T05:00:17Z", "kyle"), "kyle");
  assert.equal(inferShiftEnd(ev, "2026-11-14T05:00:17Z", "jon"), null);
  assert.equal(inferShiftEnd(ev, "2026-11-14T07:00:00Z"), null);
});
test("shift-end inference: two people at once is unknown, not a guess", () => {
  const ev = [{ user_id: "a", occurred_at: "2026-11-14T05:00:00Z" }, { user_id: "b", occurred_at: "2026-11-14T05:00:30Z" }];
  assert.equal(inferShiftEnd(ev, "2026-11-14T05:01:00Z"), null);
  assert.equal(inferShiftEnd([], null), null);
});
test("story line leaves out what isn't known", () => {
  assert.match(storyLine("Deadlined", { byName: "Kyle Tatro", at: "2026-11-14T05:00:17Z", source: "shift end" }), /^Deadlined by Kyle Tatro · .+ · shift end$/);
  assert.equal(storyLine("Deadlined", { byName: null, at: null, source: null }), "Deadlined");
});
