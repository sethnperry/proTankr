// lib/trips/cancelReasons.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cancelReasonsText, rackReasonFor, reasonCounts } from "./cancelReasons.ts";

test("reasons read in the order picked; rack reason is the first terminal issue", () => {
  assert.equal(cancelReasonsText(["traffic", "rack_hopping", "out_of_allocation"]), "Traffic → Rack Hopping → Out of Allocation");
  assert.equal(rackReasonFor(["traffic", "terminal_gauging", "out_of_allocation"]), "out_of_allocation");
  assert.equal(rackReasonFor(["traffic"]), "other");
});

test("reason counts count each trip once per reason", () => {
  const t = (r: string[]) => ({ trip: { cancel_reasons: r } as any });
  assert.deepEqual(reasonCounts([t(["out_of_allocation", "traffic"]), t(["out_of_allocation"]), t([])]),
    [{ code: "out_of_allocation", count: 2 }, { code: "traffic", count: 1 }]);
});
