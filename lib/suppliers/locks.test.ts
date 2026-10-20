import test from "node:test";
import assert from "node:assert/strict";
import { alignSteps, touchesLocked } from "./locks.ts";

test("blank steps drop with their locks; locks stay lined up", () => {
  const r = alignSteps(["a", " ", "c"], [true, true, false]);
  assert.deepEqual(r.steps, ["a", "c"]);
  assert.deepEqual(r.locks, [true, false]);
});

test("missing locks read as unlocked", () => {
  assert.deepEqual(alignSteps(["a", "b"], []).locks, [false, false]);
});

test("touching a locked step or account is refused, an unlocked one is fine", () => {
  const old = { account: "1234", accountLocked: true, steps: ["a", "b"], locks: [true, false] };
  assert.match(touchesLocked(old, { account: "9", steps: ["a", "b"] })!, /account/);
  assert.match(touchesLocked(old, { account: "1234", steps: ["x", "b"] })!, /Step 1/);
  assert.equal(touchesLocked(old, { account: "1234", steps: ["a", "y"] }), null);
});
