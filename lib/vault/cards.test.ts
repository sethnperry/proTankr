import { test } from "node:test";
import assert from "node:assert/strict";
import { maskCard, groupCard } from "./cards.ts";

test("masks to last 4, last 5 for Amex", () => {
  assert.equal(maskCard("4111 1111 1111 1234", "Visa"), "•••• 1234");
  assert.equal(maskCard("378282246310005", "Amex"), "•••• 10005");
  assert.equal(maskCard("", "Visa"), "");
  assert.equal(groupCard("378282246310005", "Amex"), "3782 822463 10005");
  assert.equal(groupCard("4111111111111234", "Visa"), "4111 1111 1111 1234");
});
