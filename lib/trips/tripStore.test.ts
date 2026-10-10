// lib/trips/tripStore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore, isPermanentError, type Sender, type StorageLike } from "./tripStore.ts";
import type { TripTable } from "./types.ts";

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function clock(start = Date.parse("2026-10-10T12:00:00Z")) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

type Call = { table: TripTable; rows: Record<string, unknown>[]; insertOnly: boolean };
function recorder(respond: (c: Call) => Awaited<ReturnType<Sender>> = () => ({ ok: true })) {
  const calls: Call[] = [];
  const send = (async (table, rows, opts) => {
    const c = { table, rows: rows as Record<string, unknown>[], insertOnly: opts.insertOnly };
    calls.push(c);
    return respond(c);
  }) as Sender;
  return { calls, send };
}

const TRIP = "00000000-0000-0000-0000-0000000000a1";

test("put stamps client_updated_at, merges, and queues once per row", () => {
  const c = clock();
  const s = createTripStore({ storageKey: "k", now: c.now });
  s.put("trips", { trip_id: TRIP, status: "draft", notes: "a" });
  c.advance(1000);
  const r = s.put("trips", { trip_id: TRIP, notes: "b" });
  assert.equal(r.status, "draft");
  assert.equal(r.notes, "b");
  assert.equal(r.client_updated_at, "2026-10-10T12:00:01.000Z");
  assert.equal(s.pendingCount(), 1);
});

test("put without its key column throws", () => {
  const s = createTripStore({ storageKey: "k" });
  assert.throws(() => s.put("trips", { notes: "x" }));
  assert.throws(() => s.put("compartment_readiness", { trailer_id: "t" }));
});

test("state survives a reload through storage", () => {
  const storage = memStorage();
  const a = createTripStore({ storage, storageKey: "k" });
  a.put("trips", { trip_id: TRIP, status: "loading" });
  const b = createTripStore({ storage, storageKey: "k" });
  assert.equal(b.get("trips", TRIP)?.status, "loading");
  assert.equal(b.pendingCount(), 1);
});

test("corrupt storage starts empty instead of crashing", () => {
  const storage = memStorage();
  storage.setItem("k", "{not json");
  const s = createTripStore({ storage, storageKey: "k" });
  assert.equal(s.pendingCount(), 0);
});

test("drain sends parents before children and clears the queue", async () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("trip_compartment_loads", { compartment_load_id: "cl1", trip_id: TRIP, comp_number: 1 });
  s.put("trip_events", { event_id: "e1", trip_id: TRIP, event_type: "arrived" });
  s.put("trips", { trip_id: TRIP, status: "loading" });
  const r = recorder();
  const res = await s.drain(r.send);
  assert.deepEqual(r.calls.map((c) => c.table), ["trips", "trip_compartment_loads", "trip_events"]);
  assert.equal(r.calls[2].insertOnly, true);
  assert.equal(r.calls[0].insertOnly, false);
  assert.deepEqual(res, { sent: 3, failed: 0, stalled: false, remaining: 0 });
  assert.ok(s.getState().lastSyncedAt);
});

test("several edits offline go up as one row with the latest values", async () => {
  const s = createTripStore({ storageKey: "k" });
  for (const n of ["a", "b", "c"]) s.put("trips", { trip_id: TRIP, notes: n });
  const r = recorder();
  await s.drain(r.send);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].rows.length, 1);
  assert.equal(r.calls[0].rows[0].notes, "c");
});

test("no signal: drain stalls, backs off, and retries once due", async () => {
  const c = clock();
  const s = createTripStore({ storageKey: "k", now: c.now });
  s.put("trips", { trip_id: TRIP });
  s.put("trip_orders", { order_id: "o1", trip_id: TRIP });
  let offline = true;
  const r = recorder(() => (offline ? { ok: false, error: { message: "Failed to fetch", status: 0 } } : { ok: true }));
  const res = await s.drain(r.send);
  assert.equal(res.stalled, true);
  assert.equal(r.calls.length, 1, "children are not tried after the parent stalls");
  assert.equal(s.pendingCount(), 2);
  // Parent not due yet: nothing is sent, not even the child (it would only
  // fail its foreign key against the missing trip).
  offline = false;
  await s.drain(r.send);
  assert.equal(r.calls.length, 1);
  c.advance(10_000);
  await s.drain(r.send);
  assert.deepEqual(r.calls.slice(1).map((x) => x.table), ["trips", "trip_orders"]);
  assert.equal(s.pendingCount(), 0);
});

test("one rejected row is isolated; the rest of the batch still lands", async () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("trip_compartment_loads", { compartment_load_id: "good", trip_id: TRIP, comp_number: 1 });
  s.put("trip_compartment_loads", { compartment_load_id: "bad", trip_id: TRIP, comp_number: 0 });
  const r = recorder((c) =>
    c.rows.some((row) => row.compartment_load_id === "bad")
      ? { ok: false, error: { message: "violates check constraint", code: "23514", status: 400 } }
      : { ok: true },
  );
  const res = await s.drain(r.send);
  assert.equal(res.sent, 1);
  assert.equal(res.failed, 1);
  assert.equal(s.pendingCount(), 0);
  assert.deepEqual(s.getState().failed.map((f) => f.key), ["bad"]);
  // Fixing the row clears its failure and queues it again.
  s.put("trip_compartment_loads", { compartment_load_id: "bad", comp_number: 2 });
  assert.equal(s.getState().failed.length, 0);
  assert.equal(s.pendingCount(), 1);
});

test("an edit made while the row is in flight stays queued", async () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("trips", { trip_id: TRIP, notes: "first" });
  const r = recorder((c) => {
    if (c.rows[0].notes === "first") s.put("trips", { trip_id: TRIP, notes: "second" });
    return { ok: true };
  });
  await s.drain(r.send);
  assert.equal(s.pendingCount(), 1);
  await s.drain(r.send);
  assert.equal(r.calls.at(-1)?.rows[0].notes, "second");
  assert.equal(s.pendingCount(), 0);
});

test("concurrent drains share one run", async () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("trips", { trip_id: TRIP });
  const r = recorder();
  await Promise.all([s.drain(r.send), s.drain(r.send)]);
  assert.equal(r.calls.length, 1);
});

test("events are append-only locally too", () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("trip_events", { event_id: "e1", trip_id: TRIP, event_type: "arrived" });
  assert.throws(() => s.put("trip_events", { event_id: "e1", event_type: "left" }));
  assert.equal((s.get("trip_events", "e1") as Record<string, unknown> | undefined)?.client_updated_at, undefined);
});

test("compartment_readiness keys on trailer + compartment", async () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("compartment_readiness", { trailer_id: "T", comp_number: 1, status: "preloaded" });
  s.put("compartment_readiness", { trailer_id: "T", comp_number: 2, status: "residue" });
  s.put("compartment_readiness", { trailer_id: "T", comp_number: 1, status: "residue" });
  assert.equal(s.pendingCount(), 2);
  assert.equal(s.get("compartment_readiness", "T|1")?.status, "residue");
});

test("hydrate never overwrites a pending local edit or a newer local row", () => {
  const c = clock();
  const s = createTripStore({ storageKey: "k", now: c.now });
  s.put("trips", { trip_id: TRIP, notes: "local" });
  s.hydrate("trips", [{ trip_id: TRIP, notes: "server" } as never]);
  assert.equal(s.get("trips", TRIP)?.notes, "local");
  // Another trip from the server lands without being queued.
  s.hydrate("trips", [{ trip_id: "other", notes: "server", client_updated_at: "2026-01-01T00:00:00Z" } as never]);
  assert.equal(s.get("trips", "other")?.notes, "server");
  assert.equal(s.pendingCount(), 1);
  // An older server copy doesn't replace a newer synced local row.
  s.hydrate("trips", [{ trip_id: "other", notes: "older", client_updated_at: "2025-01-01T00:00:00Z" } as never]);
  assert.equal(s.get("trips", "other")?.notes, "server");
});

test("forgetTrip drops a synced trip's rows, refuses while any are queued", async () => {
  const s = createTripStore({ storageKey: "k" });
  s.put("trips", { trip_id: TRIP });
  s.put("trip_deliveries", { delivery_id: "d1", trip_id: TRIP });
  s.put("trip_delivery_tanks", { delivery_tank_id: "dt1", delivery_id: "d1", tank_number: "1" });
  s.put("compartment_readiness", { trailer_id: "T", comp_number: 1 });
  assert.equal(s.forgetTrip(TRIP), false);
  await s.drain(recorder().send);
  assert.equal(s.forgetTrip(TRIP), true);
  assert.equal(s.list("trips").length, 0);
  assert.equal(s.list("trip_delivery_tanks").length, 0);
  assert.equal(s.list("compartment_readiness").length, 1, "readiness belongs to the trailer, not the trip");
});

test("error classification", () => {
  assert.equal(isPermanentError({ message: "rls", code: "42501", status: 403 }), true);
  assert.equal(isPermanentError({ message: "bad uuid", code: "22P02", status: 400 }), true);
  assert.equal(isPermanentError({ message: "fk", code: "23503", status: 409 }), false);
  assert.equal(isPermanentError({ message: "Failed to fetch", status: 0 }), false);
  assert.equal(isPermanentError({ message: "jwt expired", code: "PGRST301", status: 401 }), false);
  assert.equal(isPermanentError({ message: "busy", status: 503 }), false);
  assert.equal(isPermanentError({ message: "rate", status: 429 }), false);
});
