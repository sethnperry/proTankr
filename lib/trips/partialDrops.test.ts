import test from "node:test";
import assert from "node:assert/strict";
import { afterPartial, partialEntry, partialsOf } from "./partialDrops.ts";

test("a partial drop leaves the rest and scales net", () => {
  const r = afterPartial(4000, 3960, 2000);
  assert.equal(r.remaining, 2000);
  assert.equal(r.netEquiv, 1980);
  assert.equal(r.remainingNet, 1980);
  assert.equal(afterPartial(4000, null, 1000).netEquiv, null);
  assert.equal(afterPartial(1000, 990, 5000).remaining, 0);
});

test("meter readings win over a typed number; no meter is an estimate", () => {
  assert.deepEqual(partialEntry({ gallons: "", meterStart: "1,000", meterEnd: "3,200" }), { gallons: 2200, estimated: false, meterStart: 1000, meterEnd: 3200 });
  assert.deepEqual(partialEntry({ gallons: "2000", meterStart: "", meterEnd: "" }), { gallons: 2000, estimated: true, meterStart: null, meterEnd: null });
  assert.ok("error" in partialEntry({ gallons: "2000", meterStart: "100", meterEnd: "" }));
  assert.ok("error" in partialEntry({ gallons: "", meterStart: "500", meterEnd: "400" }));
  assert.ok("error" in partialEntry({ gallons: "", meterStart: "", meterEnd: "" }));
});

test("partialsOf reads only partial_drop events", () => {
  const ev = (type: string, p: object) => ({ event_id: "e", trip_id: "t", event_type: type, occurred_at: "x", actor_id: "u", pickup_id: null, delivery_id: "d1", payload: p }) as any;
  const r = partialsOf([ev("delivery_finished", {}), ev("partial_drop", { comp_number: 1, gallons: 2000 })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].delivery_id, "d1");
});
