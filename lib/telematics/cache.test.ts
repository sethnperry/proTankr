import test from "node:test";
import assert from "node:assert/strict";
import { cached, mapToPairs, memoryStore, pairsToMap, type CacheStore } from "./cache.ts";
import { TelematicsAuthError } from "./types.ts";

test("a fresh stored answer is reused; an old one is asked for again", async () => {
  const store = memoryStore();
  let n = 0;
  const f = async () => ++n;
  assert.equal(await cached(store, "k", 60_000, f), 1);
  assert.equal(await cached(store, "k", 60_000, f), 1);
  assert.equal(n, 1);
  assert.equal(await cached(store, "k", 0, f), 2);
});

test("the lifetime can depend on the answer (a missing value is looked for again sooner)", async () => {
  const store = memoryStore();
  let n = 0;
  const f = async (): Promise<number | null> => { n++; return null; };
  const ttl = (v: number | null) => (v == null ? 0 : 60_000);
  await cached(store, "o", ttl, f);
  await cached(store, "o", ttl, f);
  assert.equal(n, 2);
});

test("when the provider fails (the quota), the last answer is served; with no answer it fails", async () => {
  const store = memoryStore();
  await cached(store, "k", 0, async () => "old");
  assert.equal(await cached(store, "k", 0, async () => { throw new Error("API calls quota exceeded"); }), "old");
  await assert.rejects(cached(memoryStore(), "k", 0, async () => { throw new Error("quota"); }), /quota/);
});

test("a stale answer older than the limit is not served", async () => {
  const store = memoryStore();
  await cached(store, "k", 0, async () => "old");
  await assert.rejects(cached(store, "k", 0, async () => { throw new Error("down"); }, { staleOkMs: -1 }), /down/);
});

test("a bad login is never hidden by an old answer", async () => {
  const store = memoryStore();
  await cached(store, "k", 0, async () => "old");
  await assert.rejects(cached(store, "k", 0, async () => { throw new TelematicsAuthError("bad login"); }), /bad login/);
});

test("overlapping calls for one key share a single provider call", async () => {
  const store = memoryStore();
  let n = 0;
  const slow = async () => { n++; await new Promise((r) => setTimeout(r, 20)); return "x"; };
  const [a, b, c] = await Promise.all([cached(store, "k", 60_000, slow), cached(store, "k", 60_000, slow), cached(store, "k", 60_000, slow)]);
  assert.deepEqual([a, b, c], ["x", "x", "x"]);
  assert.equal(n, 1);
});

test("a broken store behaves like an empty one", async () => {
  const broken: CacheStore = { async get() { throw new Error("db"); }, async set() { throw new Error("db"); } };
  assert.equal(await cached(broken, "k", 60_000, async () => 7), 7);
});

test("a Map round-trips through pairs", () => {
  const m = new Map([["a", ["1", "2"]]]);
  assert.deepEqual([...pairsToMap<string, string[]>(JSON.parse(JSON.stringify(mapToPairs(m)))).entries()], [["a", ["1", "2"]]]);
  assert.equal(pairsToMap(null).size, 0);
});

import { geotabProvider } from "./geotab.ts";

test("geotab: with a shared cache a second reading makes no new calls, and slim skips fuel and hours", async () => {
  const calls: string[] = [];
  const f = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(`${body.method}:${body.params?.typeName ?? ""}:${body.params?.search?.diagnosticSearch?.id ?? ""}`);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (body.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s", userName: "u" } });
    if (body.params.typeName === "DeviceStatusInfo") return ok([{ latitude: 27.9, longitude: -82.4, speed: 0, dateTime: "2026-10-23T10:00:00Z" }]);
    if (body.params.search?.diagnosticSearch?.id === "DiagnosticOdometerAdjustmentId") return ok([{ data: 160934.4, dateTime: "2026-10-23T09:00:00Z" }]);
    return ok([{ data: 50, dateTime: "2026-10-23T09:30:00Z" }]);
  }) as any;
  const store = memoryStore();
  const p = geotabProvider({ database: "cache-db", userName: "u", password: "p" }, f, store);
  const slim = await p.reading("b1", { slim: true });
  assert.equal(slim.odometerMi, 100);
  assert.equal(slim.fuelLevelPct, null);
  assert.ok(!calls.some((c) => /FuelLevel|EngineHours/.test(c)));
  const first = calls.length;
  await p.reading("b1", { slim: true });
  assert.equal(calls.length, first, "a repeat inside the cache window makes no calls");
});

test("geotab: a quota error names the call that tripped it", async () => {
  const f = (async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    if (body.method === "Authenticate") return { ok: true, json: async () => ({ result: { path: "my5.geotab.com", credentials: { database: "d", sessionId: "s", userName: "u" } } }) };
    return { ok: true, json: async () => ({ error: { message: "API calls quota exceeded. Maximum admitted 10 per 1m." } }) };
  }) as any;
  const p = geotabProvider({ database: "quota-db", userName: "u", password: "p" }, f);
  await assert.rejects(p.listDrivers(), /quota exceeded.*\[Get:User\]/);
});

test("geotab: a fresh odometer accepts only the last minute's answer", async () => {
  let odoCalls = 0;
  const f = (async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    const ok = (result: unknown) => ({ ok: true, json: async () => ({ result }) });
    if (body.method === "Authenticate") return ok({ path: "my5.geotab.com", credentials: { database: "d", sessionId: "s", userName: "u" } });
    if (body.params.typeName === "DeviceStatusInfo") return ok([{ latitude: 27.9, longitude: -82.4, speed: 0, dateTime: "2026-10-23T10:00:00Z" }]);
    if (body.params.search?.diagnosticSearch?.id === "DiagnosticOdometerAdjustmentId") { odoCalls++; return ok([{ data: 160934.4, dateTime: "2026-10-23T09:00:00Z" }]); }
    return ok([]);
  }) as any;
  // A store whose stored answers can be aged by hand.
  const m = new Map<string, { at: number; v: unknown }>();
  const store: CacheStore = { async get(k) { return m.get(k) ?? null; }, async set(k, v) { m.set(k, { at: Date.now(), v: v ?? null }); } };
  const p = geotabProvider({ database: "fresh-db", userName: "u", password: "p" }, f, store);
  await p.reading("b1", { slim: true });
  assert.equal(odoCalls, 1);
  m.get("odo:b1")!.at = Date.now() - 2 * 60_000; // two minutes old
  await p.reading("b1", { slim: true });
  assert.equal(odoCalls, 1, "a normal read still reuses a two-minute-old odometer");
  await p.reading("b1", { slim: true, fresh: true });
  assert.equal(odoCalls, 2, "a fresh read asks again");
  await p.reading("b1", { slim: true, fresh: true });
  assert.equal(odoCalls, 2, "but only once a minute");
});

test("keepOnNull: a 'not found' answer doesn't wipe out a good one", async () => {
  const store = memoryStore();
  await store.set("odo", 322277);
  let t = 0;
  const v = await cached(store, "odo", () => 0, async () => { t++; return null as number | null; }, { keepOnNull: true });
  assert.equal(v, 322277);
  assert.equal((await store.get("odo"))?.v, 322277);
  assert.equal(t, 1);
  // without the option, null is stored as before
  const store2 = memoryStore();
  await store2.set("odo", 322277);
  assert.equal(await cached(store2, "odo", () => 0, async () => null as number | null), null);
});
