import test from "node:test";
import assert from "node:assert/strict";
import { activeReasons, categoryLabel, groupByCategory, reasonsOrDefault, DEFAULT_SHIFT_REASONS, type Reason } from "./reasons.ts";

const r = (label: string, kind: Reason["kind"], o: Partial<Reason> = {}): Reason => ({ reason_id: label, kind, label, sort_order: 1, is_active: true, ...o });

test("only this kind, only shown, in order", () => {
  const list = [r("b", "callout", { sort_order: 2 }), r("a", "callout", { sort_order: 1 }), r("hidden", "callout", { is_active: false }), r("other", "delivery")];
  assert.deepEqual(activeReasons(list, "callout").map((x) => x.label), ["a", "b"]);
});

test("a company with no shift reasons starts from the built-in eight", () => {
  assert.equal(DEFAULT_SHIFT_REASONS.length, 8);
  assert.equal(reasonsOrDefault([], "shift_explanation").length, 8);
  assert.equal(reasonsOrDefault([], "callout").length, 5, "call-outs start from five built-in reasons too");
  assert.equal(reasonsOrDefault([r("Mine", "callout")], "callout").length, 1, "a company's own list replaces them");
  assert.equal(reasonsOrDefault([r("Mine", "shift_explanation", { category: "breakdown" })], "shift_explanation").length, 1);
});

test("chips group by category, uncategorised last", () => {
  const g = groupByCategory([
    { reason_id: "1", label: "Weather", category: "traffic_weather" },
    { reason_id: "2", label: "Truck broke down", category: "breakdown" },
    { reason_id: "3", label: "Misc", category: null },
  ]);
  assert.deepEqual(g.map((x) => x.category), ["breakdown", "traffic_weather", ""]);
  assert.equal(categoryLabel("shop_time"), "Shop time");
});
