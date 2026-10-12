// lib/trips/pruneTrips.ts
//
// Drop trips from the phone that were deleted on the server. The store only
// ever adds or updates rows from the server (hydrate), so a trip removed
// server-side would otherwise stay in the phone's list forever.
//
// `server` is this driver's most recent trips, newest first, at most `limit`.
// A local trip of the same driver that's missing from it is gone, as long as
// it falls inside that window: everything if the server returned fewer than
// `limit` rows, otherwise anything started at or after the oldest returned.
// A trip whose own row is still unsent (queued or failed) is kept: it may have
// been made offline and never reached the server. Otherwise the trip and any
// unsent child rows go (those children could only fail the foreign key).

import type { TripStore } from "./tripStore.ts";
import type { TripRow } from "./types.ts";

export function pruneMissingTrips(
  store: Pick<TripStore, "list" | "forgetTrip" | "getState">,
  userId: string,
  server: TripRow[],
  limit: number,
): string[] {
  const onServer = new Set(server.map((t) => t.trip_id));
  const full = server.length >= limit;
  const oldest = full
    ? server.map((t) => t.started_at ?? "").filter(Boolean).sort()[0] ?? null
    : null;
  if (full && !oldest) return [];
  const st = store.getState();
  const unsent = new Set([
    ...st.queue.filter((q) => q.table === "trips").map((q) => q.key),
    ...st.failed.filter((f) => f.table === "trips").map((f) => f.key),
  ]);
  const dropped: string[] = [];
  for (const t of store.list("trips", (r) => r.driver_id === userId)) {
    if (onServer.has(t.trip_id)) continue;
    if (full && (!t.started_at || t.started_at < (oldest as string))) continue;
    if (unsent.has(t.trip_id)) continue;
    if (store.forgetTrip(t.trip_id, { dropPending: true })) dropped.push(t.trip_id);
  }
  return dropped;
}
