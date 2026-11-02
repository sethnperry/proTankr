import test from "node:test";
import assert from "node:assert/strict";
import { approvalUrl, expiryFrom, hashToken, looksLikeToken, newToken, statusFor } from "./token.ts";

test("tokens are long, random and only their hash is kept", () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.token.length, 43);
  assert.ok(looksLikeToken(a.token));
  assert.equal(a.hash, hashToken(a.token));
  assert.notEqual(a.hash, a.token);
  assert.equal(a.hash.length, 64);
});

test("only well-formed tokens are looked up", () => {
  assert.equal(looksLikeToken("short"), false);
  assert.equal(looksLikeToken("x".repeat(43) + "!"), false);
  assert.equal(looksLikeToken(undefined), false);
  assert.equal(looksLikeToken("../../etc/passwd"), false);
});

test("expiry and url", () => {
  assert.equal(expiryFrom(Date.parse("2026-11-02T00:00:00Z"), 14), "2026-11-16T00:00:00.000Z");
  assert.equal(approvalUrl("https://protankr.com/", "abc"), "https://protankr.com/approve/abc");
});

test("a decision maps to the record's status; unknown purposes do nothing", () => {
  assert.equal(statusFor("repair_request", "approve"), "approved");
  assert.equal(statusFor("repair_request", "deny"), "denied");
  assert.equal(statusFor("mystery", "approve"), null);
});
