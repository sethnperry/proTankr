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
