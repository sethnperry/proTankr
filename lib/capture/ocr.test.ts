import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceiptReply } from "./ocr.ts";

test("reads the JSON a reader returns, even with chatter around it", () => {
  const r = parseReceiptReply('Here you go: {"station":"Love\'s #412","gallons":"112.4","amount":"$398.20","date":"2026-11-02"} done');
  assert.deepEqual(r, { station: "Love's #412", gallons: 112.4, amount: 398.2, date: "2026-11-02" });
});

test("drops values that cannot be fuel and gives up on nonsense", () => {
  assert.deepEqual(parseReceiptReply('{"station":null,"gallons":9000,"amount":12.5,"date":"yesterday"}'), { station: null, gallons: null, amount: 12.5, date: null });
  assert.equal(parseReceiptReply('{"station":null,"gallons":null,"amount":null}'), null);
  assert.equal(parseReceiptReply("I can't read this"), null);
  assert.equal(parseReceiptReply("{not json}"), null);
});
