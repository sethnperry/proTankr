import { test } from "node:test";
import assert from "node:assert/strict";
import { lockoutMs, recordFailure, waitLeft, shouldLockAfterHidden, fmtWait } from "./guard.ts";

test("five free tries, then 30s doubling to 15 min", () => {
  assert.equal(lockoutMs(4), 0);
  assert.equal(lockoutMs(5), 30_000);
  assert.equal(lockoutMs(6), 60_000);
  assert.equal(lockoutMs(30), 15 * 60_000);
});
test("a failure sets the wait", () => {
  let s = { count: 0, until: 0 };
  for (let i = 0; i < 5; i++) s = recordFailure(s, 1000);
  assert.equal(waitLeft(s, 1000), 30_000);
  assert.equal(waitLeft(s, 40_000), 0);
});
test("background allowance", () => {
  assert.equal(shouldLockAfterHidden(0, 30_000), false);
  assert.equal(shouldLockAfterHidden(0, 60_000), true);
});
test("wait text", () => assert.equal(fmtWait(90_000), "1:30"));
