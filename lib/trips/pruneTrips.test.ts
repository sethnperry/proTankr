// lib/trips/pruneTrips.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "./tripStore.ts";
import { pruneMissingTrips } from "./pruneTrips.ts";
import type { TripRow } from "./types.ts";

const ME = "me";
const trip = (id: string, started: string): TripRow =>
  ({ trip_id: id, company_id: "co", driver_id: ME, created_by: ME, status: "complete", started_at: started } as TripRow);

function storeWith(rows: TripRow[]) {
  const s = createTripStore({ storage: null, storageKey: "t" });
  s.hydrate("trips", rows);
  return s;
}

test("drops a local trip the server no longer has; keeps queued ones", () => {
  const s = storeWith([trip("a", "2026-10-10T00:00:00Z"), trip("b", "2026-10-11T00:00:00Z")]);
  s.put("trips", { ...trip("c", "2026-10-12T00:00:00Z") }); // made offline, still queued
  const dropped = pruneMissingTrips(s, ME, [trip("b", "2026-10-11T00:00:00Z")], 50);
  assert.deepEqual(dropped, ["a"]);
  assert.deepEqual(s.list("trips").map((t) => t.trip_id).sort(), ["b", "c"]);
});

test("a full page only prunes inside its window", () => {
  const s = storeWith([trip("old", "2026-01-01T00:00:00Z"), trip("gone", "2026-10-11T00:00:00Z")]);
  const dropped = pruneMissingTrips(s, ME, [trip("x", "2026-10-12T00:00:00Z"), trip("y", "2026-10-10T00:00:00Z")], 2);
  assert.deepEqual(dropped, ["gone"]);
  assert.ok(s.get("trips", "old"));
});

test("a trip with unsent child rows is kept, never dropped", () => {
  const s = storeWith([trip("a", "2026-10-10T00:00:00Z")]);
  s.put("trip_events", { event_id: "e1", trip_id: "a", type: "note" } as never);
  const dropped = pruneMissingTrips(s, ME, [trip("z", "2026-10-12T00:00:00Z")], 50);
  assert.deepEqual(dropped, []);
  assert.equal(s.list("trips").length, 1);
  assert.equal(s.getState().queue.length, 1);
});

test("an empty server answer (bad session, hiccup) removes nothing", () => {
  const s = storeWith([trip("a", "2026-10-10T00:00:00Z"), trip("b", "2026-10-11T00:00:00Z")]);
  assert.deepEqual(pruneMissingTrips(s, ME, [], 10), []);
  assert.equal(s.list("trips").length, 2);
});

test("an open, dispatched or parked trip is never pruned", () => {
  const s = storeWith(["draft", "loading", "delivering", "dispatched", "parked"].map((st, i) => ({ ...trip(`t${i}`, "2026-10-1" + i + "T00:00:00Z"), status: st } as TripRow)));
  assert.deepEqual(pruneMissingTrips(s, ME, [trip("z", "2026-10-20T00:00:00Z")], 50), []);
  assert.equal(s.list("trips").length, 5);
});

test("a live trip the server answered without, fully synced, is dropped when the open answer was clean", () => {
  const s = storeWith(["in_transit", "parked", "dispatched"].map((st, i) => ({ ...trip(`t${i}`, "2026-10-1" + i + "T00:00:00Z"), status: st } as TripRow)));
  const ids = new Set(["z"]);
  assert.deepEqual(pruneMissingTrips(s, ME, [trip("z", "2026-10-20T00:00:00Z")], 50, { serverTripIds: ids }).sort(), ["t0", "t1", "t2"]);
  assert.equal(s.list("trips").length, 0);
});

test("a live trip the server does have is kept, and so is one with anything unsent", () => {
  const s = storeWith([{ ...trip("here", "2026-10-11T00:00:00Z"), status: "in_transit" } as TripRow, { ...trip("queued", "2026-10-12T00:00:00Z"), status: "in_transit" } as TripRow]);
  s.put("trips", { ...s.list("trips").find((t) => t.trip_id === "queued")!, notes: "edit" } as TripRow); // an unsent change
  const out = pruneMissingTrips(s, ME, [trip("here", "2026-10-11T00:00:00Z")], 50, { serverTripIds: new Set(["here"]) });
  assert.deepEqual(out, []);
  assert.equal(s.list("trips").length, 2);
});

test("with no clean open answer, live trips stay as before", () => {
  const s = storeWith([{ ...trip("a", "2026-10-11T00:00:00Z"), status: "in_transit" } as TripRow]);
  assert.deepEqual(pruneMissingTrips(s, ME, [trip("z", "2026-10-20T00:00:00Z")], 50), []);
});
