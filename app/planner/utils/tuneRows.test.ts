import test from "node:test";
import assert from "node:assert/strict";
import { buildTuneRows, shortDateTime } from "./tuneRows.ts";

const base = {
  productIds: ["b", "a"],
  tuned: {},
  productTempF: {},
  tempF: 70,
  lastApiByProduct: { a: 38.7, b: null },
  lastInfoById: { a: { last_api_updated_at: "not a date" } },
  lbsPerGal: (id: string) => (id === "a" ? 7.1 : NaN),
  basis: () => null,
  codeById: { a: "D2" },
  nameById: new Map([["b", "Regular"]]),
  hexById: { a: " #ff0 " },
};

test("rows sort by code and fall back to name, then id", () => {
  const r = buildTuneRows(base);
  assert.deepEqual(r.map((x) => x.code), ["D2", "Regular"]);
});

test("a tuned product shows its own temp and 'just now'", () => {
  const r = buildTuneRows({ ...base, tuned: { a: { api: 40, tempF: 85 } } }).find((x) => x.productId === "a")!;
  assert.equal(r.tempF, 85); assert.equal(r.api, 40); assert.equal(r.dateLabel, "just now"); assert.equal(r.tuned, true);
});

test("untuned: product temp, then shared temp; bad date reads 'no reading'; NaN density becomes null", () => {
  const rows = buildTuneRows({ ...base, productTempF: { a: 66 } });
  const a = rows.find((x) => x.productId === "a")!, b = rows.find((x) => x.productId === "b")!;
  assert.equal(a.tempF, 66); assert.equal(b.tempF, 70);
  assert.equal(a.dateLabel, "no reading"); assert.equal(b.lbsPerGal, null);
  assert.equal(a.lastApi, 38.7); assert.equal(b.lastApi, null);
  assert.equal(a.dotColor, "#ff0"); assert.equal(b.dotColor, "rgba(255,255,255,0.5)");
});

test("shortDateTime formats 12-hour local time", () => {
  assert.equal(shortDateTime(null), null);
  assert.match(shortDateTime(new Date(2026, 9, 24, 15, 5).toISOString())!, /^10\/24 3:05 PM$/);
  assert.match(shortDateTime(new Date(2026, 9, 24, 0, 7).toISOString())!, /^10\/24 12:07 AM$/);
});
