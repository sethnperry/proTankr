import { test } from "node:test";
import assert from "node:assert/strict";
import { maskCard, groupCard, maskCardGroups, cardExpIso } from "./cards.ts";

test("masks to last 4, last 5 for Amex", () => {
  assert.equal(maskCard("4111 1111 1111 1234", "Visa"), "•••• 1234");
  assert.equal(maskCard("378282246310005", "Amex"), "•••• 10005");
  assert.equal(maskCard("", "Visa"), "");
  assert.equal(groupCard("378282246310005", "Amex"), "3782 822463 10005");
  assert.equal(groupCard("4111111111111234", "Visa"), "4111 1111 1111 1234");
});

test("card-shaped mask", () => {
  assert.equal(maskCardGroups("4111 1111 1111 1234", "Visa"), "•••• •••• •••• 1234");
  assert.equal(maskCardGroups("371449635451005", "Amex"), "•••• •••••• 51005");
  assert.equal(maskCardGroups("", "Visa"), "");
});
test("card expiry is the last day of the month", () => {
  assert.equal(cardExpIso("08/28"), "2028-08-31");
  assert.equal(cardExpIso("2/2028"), "2028-02-29");
  assert.equal(cardExpIso("13/28"), null);
  assert.equal(cardExpIso("soon"), null);
});
