import { test } from "node:test";
import assert from "node:assert/strict";
import { authCookieOptionsForHost } from "./cookieScope.ts";

test("main hosts share one .protankr.com cookie", () => {
  assert.deepEqual(authCookieOptionsForHost("www.protankr.com"), { domain: ".protankr.com" });
  assert.deepEqual(authCookieOptionsForHost("protankr.com"), { domain: ".protankr.com" });
});

test("demo host gets its own host-only, differently named cookie", () => {
  const o = authCookieOptionsForHost("demo.protankr.com");
  assert.equal(o?.domain, undefined);
  assert.equal(o?.name, "sb-demo-auth-token");
  assert.deepEqual(authCookieOptionsForHost("demo.protankr.com:443"), o);
});

test("other hosts use the SDK default", () => {
  assert.equal(authCookieOptionsForHost("localhost"), undefined);
  assert.equal(authCookieOptionsForHost("pro-tankr-git-x.vercel.app"), undefined);
});
