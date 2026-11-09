import test from "node:test";
import assert from "node:assert/strict";
import { firstDropComps, splitProblem } from "./drops.ts";

test("the first drop gets what later drops do not keep", () => {
  assert.deepEqual(firstDropComps([1, 2, 3], [{ locationId: "b", comps: [3] }]), [1, 2]);
});
test("a split needs a compartment at every drop and none twice", () => {
  assert.equal(splitProblem([1, 2, 3], [{ locationId: "b", comps: [3] }]), null);
  assert.match(splitProblem([1, 2], [{ locationId: "b", comps: [] }])!, /at least one/);
  assert.match(splitProblem([1, 2], [{ locationId: "b", comps: [1, 2] }])!, /first drop/);
  assert.match(splitProblem([1, 2, 3], [{ locationId: "b", comps: [3] }, { locationId: "c", comps: [3] }])!, /only go to one/);
});
