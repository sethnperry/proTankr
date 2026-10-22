// lib/telematics/shipmentCache.ts
//
// Fleet-wide shipment lookups with a shared cache. The telematics provider allows only a few calls a
// minute per company, so one call is made for the whole company, kept for FRESH_MS in a table every
// server instance shares, and a "quota exceeded" answer pauses calls for BLOCK_MS. Nothing here ever
// throws at the caller: when the provider can't answer, the app just has no shipment to suggest.

export type ShipmentRow = { vehicleId: string; documentNumber: string; start: string | null; shipperName: string | null; commodity: string | null };
export type CacheRecord = { fetched_at: string; blocked_until: string | null; rows: ShipmentRow[] } | null;

export const FRESH_MS = 25_000;
export const BLOCK_MS = 60_000;
export const WINDOW_MS = 6 * 3600_000; // how far back one fetch reaches

export type Decision = "use_cache" | "blocked" | "fetch";

/** What to do with whatever is in the cache right now. */
export function decide(rec: CacheRecord, nowMs: number): Decision {
  if (!rec) return "fetch";
  if (rec.blocked_until && Date.parse(rec.blocked_until) > nowMs) return "blocked";
  return nowMs - Date.parse(rec.fetched_at) < FRESH_MS ? "use_cache" : "fetch";
}

export const isQuotaError = (e: unknown) => /quota exceeded|rate limit|too many/i.test(String((e as Error)?.message ?? e));

/** One truck's shipments since a time, newest first. */
export function forVehicle(rows: ShipmentRow[], vehicleId: string, sinceMs: number): ShipmentRow[] {
  return rows
    .filter((r) => r.vehicleId === vehicleId && (!r.start || Date.parse(r.start) >= sinceMs))
    .sort((a, b) => String(b.start ?? "").localeCompare(String(a.start ?? "")));
}
