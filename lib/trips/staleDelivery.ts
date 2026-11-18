// lib/trips/staleDelivery.ts
//
// A delivery the driver arrived at, and never tapped Finish on, long after the drop would normally be over.
// Used by the auto end-of-shift (don't park a load that's mid-delivery), the driver dashboard (ask them to finish it)
// and the dispatch board (flag it). Pure.

export const STALE_DELIVERY_HOURS = 2;

type D = { arrived_at: string | null; left_at: string | null; status?: string | null };

/** A delivery that is open (arrived, not left, not complete). */
export const isOpenDelivery = (d: D) => !!d.arrived_at && !d.left_at && d.status !== "complete";

/** The first open delivery that has been open longer than `hours`, or null. */
export function staleOpenDelivery<T extends D>(deliveries: T[], nowMs: number, hours = STALE_DELIVERY_HOURS): T | null {
  for (const d of deliveries) {
    if (!isOpenDelivery(d)) continue;
    const since = Date.parse(d.arrived_at as string);
    if (Number.isFinite(since) && nowMs - since >= hours * 3600_000) return d;
  }
  return null;
}
