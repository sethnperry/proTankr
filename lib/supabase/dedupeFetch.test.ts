import test from "node:test";
import assert from "node:assert/strict";
import { makeDedupeFetch } from "./dedupeFetch.ts";

const H = { headers: { authorization: "Bearer a" } };
function setup() {
  let n = 0; let t = 0;
  const base = (async () => { n++; return new Response(JSON.stringify({ n }), { status: 200 }); }) as typeof fetch;
  const f = makeDedupeFetch(base, () => t);
  return { f, calls: () => n, tick: (ms: number) => { t += ms; } };
}

test("identical reads share one request, each caller gets a readable body", async () => {
  const s = setup();
  const [a, b] = await Promise.all([s.f("https://x/rest/v1/trucks?select=*", H), s.f("https://x/rest/v1/trucks?select=*", H)]);
  assert.equal(s.calls(), 1);
  assert.deepEqual(await a.json(), await b.json());
});
test("a different query or a different user is its own request", async () => {
  const s = setup();
  await s.f("https://x/rest/v1/trucks?select=a", H);
  await s.f("https://x/rest/v1/trucks?select=b", H);
  await s.f("https://x/rest/v1/trucks?select=a", { headers: { authorization: "Bearer other" } });
  assert.equal(s.calls(), 3);
});
test("a read after the window goes to the server again", async () => {
  const s = setup();
  await s.f("https://x/rest/v1/trucks", H); s.tick(5000); await s.f("https://x/rest/v1/trucks", H);
  assert.equal(s.calls(), 2);
});
test("a write or an RPC clears what was remembered", async () => {
  const s = setup();
  await s.f("https://x/rest/v1/trucks", H);
  await s.f("https://x/rest/v1/trucks?id=eq.1", { ...H, method: "PATCH", body: "{}" });
  await s.f("https://x/rest/v1/trucks", H);
  assert.equal(s.calls(), 3);
  await s.f("https://x/rest/v1/rpc/set_active_company", { ...H, method: "POST", body: "{}" });
  await s.f("https://x/rest/v1/trucks", H);
  assert.equal(s.calls(), 5);
});
test("is_super_admin is shared and survives a write; who-am-I is shared for the same token", async () => {
  const s = setup();
  const sa = () => s.f("https://x/rest/v1/rpc/is_super_admin", { ...H, method: "POST", body: "{}" });
  await sa(); await sa();
  await s.f("https://x/rest/v1/trucks?id=eq.1", { ...H, method: "DELETE" });
  await sa();
  assert.equal(s.calls(), 2);
  await s.f("https://x/auth/v1/user", H); await s.f("https://x/auth/v1/user", H);
  assert.equal(s.calls(), 3);
});
test("token refresh and other calls pass straight through", async () => {
  const s = setup();
  await s.f("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST", body: "{}" });
  await s.f("https://x/auth/v1/token?grant_type=refresh_token", { method: "POST", body: "{}" });
  assert.equal(s.calls(), 2);
});
test("an error answer is not remembered", async () => {
  let n = 0;
  const base = (async () => { n++; return new Response("no", { status: 500 }); }) as typeof fetch;
  const f = makeDedupeFetch(base, () => 0);
  await f("https://x/rest/v1/trucks", H); await f("https://x/rest/v1/trucks", H);
  assert.equal(n, 2);
});
test("the same URL asked for a single object vs a list is not shared", async () => {
  const s = setup();
  await s.f("https://x/rest/v1/trucks?id=eq.1", { headers: { authorization: "Bearer a", accept: "application/vnd.pgrst.object+json" } });
  await s.f("https://x/rest/v1/trucks?id=eq.1", { headers: { authorization: "Bearer a" } });
  assert.equal(s.calls(), 2);
});
