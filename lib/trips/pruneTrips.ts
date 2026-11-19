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
// Safety first: this must never take work off a driver's phone. So it does nothing when the server returned no trips
// at all (a signed-out or expired session also answers with an empty list, no error), it never touches a trip that is
// still open, dispatched or parked, and it never touches a trip with anything unsent. Only a finished or cancelled
// trip, fully synced, that the server no longer has is forgotten.
// One exception, when the caller proves the server's open-trip answer succeeded (`serverTripIds`, every trip the server
// returned for this driver and trailer): a live trip that is missing from it and has nothing unsent was deleted on the
// server (a bad trip cleaned up by hand), so it leaves the phone too instead of sitting on the dashboard forever.

import type { TripStore } from "./tripStore.ts";
import type { TripRow } from "./types.ts";

export function pruneMissingTrips(
  store: Pick<TripStore, "list" | "forgetTrip" | "getState">,
  userId: string,
  server: TripRow[],
  limit: number,
  opts?: { serverTripIds?: Set<string> },
): string[] {
  if (server.length === 0) return []; // an empty answer proves nothing: it is also what a bad session returns
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
    const isLive = t.status !== "complete" && t.status !== "cancelled";
    if (full && !(isLive && opts?.serverTripIds) && (!t.started_at || t.started_at < (oldest as string))) continue;
    if (unsent.has(t.trip_id)) continue;
    const live = t.status !== "complete" && t.status !== "cancelled";
    if (live && !opts?.serverTripIds) continue; // live work stays, whatever the server said
    if (live && opts?.serverTripIds?.has(t.trip_id)) continue;
    if (store.forgetTrip(t.trip_id)) dropped.push(t.trip_id); // refuses while any row of it is unsent
  }
  return dropped;
}
