import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeAccountNumber } from "./noteGuard.ts";

test("terminal note guard: blocks account-like numbers, allows short codes and phones", () => {
  assert.equal(looksLikeAccountNumber("20014625"), true);
  assert.equal(looksLikeAccountNumber("acct 2001 4625"), true);
  assert.equal(looksLikeAccountNumber("Motiva 123-456"), true);
  assert.equal(looksLikeAccountNumber("Gate code 4625, 2 lanes"), false);
  assert.equal(looksLikeAccountNumber("Lane 12 bay 345"), false);
  assert.equal(looksLikeAccountNumber("Office (813) 555-1212"), false);
  assert.equal(looksLikeAccountNumber("Use lanes 3 and 4 for diesel"), false);
});
