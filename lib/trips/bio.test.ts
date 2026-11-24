import test from "node:test";
import assert from "node:assert/strict";
import { bioFromPercent, bioPercentOf, parseBio, bioLabel } from "./bio.ts";

test("percent prefill and back", () => {
  assert.equal(bioFromPercent(4300, 20), 860);
  assert.equal(bioPercentOf(4300, 1008.64), "23.5");
});
test("parse and label", () => {
  assert.equal(parseBio("1,008.64"), 1008.64);
  assert.equal(parseBio(""), null);
  assert.equal(parseBio("0"), null);
  assert.equal(bioLabel(1008.64), "1,009");
});
