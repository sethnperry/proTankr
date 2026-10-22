// lib/telematics/shipmentMatch.ts
//
// Matches the shipment numbers (BOLs) a driver enters in the telematics Drive app to one of our
// pickups. Checked against real loads on truck 25184: the shipment is logged within a couple of
// minutes of the driver leaving the rack (from 3 minutes before to 2 minutes after our "left"
// time), always after arriving. The end time is useless (they were closed in bulk), so only the
// start is used. Pure: no data access.

export type GeoShipment = { documentNumber: string; start: string | null; shipperName?: string | null; commodity?: string | null };

/** Allowed slack before we arrived (clock differences) and after we left (entered late). */
export const BEFORE_ARRIVE_MS = 10 * 60000;
export const AFTER_LEAVE_MS = 20 * 60000;

/**
 * Shipments that belong to a pickup: started between arriving (a little early is fine) and
 * leaving (plus a little). With no left time yet, the window runs to `nowMs`. Numbers already on
 * another load are dropped. Oldest first, one entry per number.
 */
export function shipmentsForPickup(
  shipments: GeoShipment[],
  pickup: { arrivedAt: string | null; leftAt: string | null },
  nowMs: number,
  usedBols: Iterable<string> = [],
): GeoShipment[] {
  const arrived = pickup.arrivedAt ? Date.parse(pickup.arrivedAt) : NaN;
  if (!Number.isFinite(arrived)) return [];
  const left = pickup.leftAt ? Date.parse(pickup.leftAt) : NaN;
  const from = arrived - BEFORE_ARRIVE_MS;
  const to = (Number.isFinite(left) ? left : nowMs) + AFTER_LEAVE_MS;
  const used = new Set([...usedBols].map((b) => String(b).trim().toLowerCase()));
  const seen = new Set<string>();
  return shipments
    .filter((s) => {
      const t = s.start ? Date.parse(s.start) : NaN;
      return Number.isFinite(t) && t >= from && t <= to;
    })
    .sort((a, b) => Date.parse(a.start as string) - Date.parse(b.start as string))
    .filter((s) => {
      const key = s.documentNumber.trim().toLowerCase();
      if (!key || used.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** What the driver typed vs what the telematics app has: "same", "different" or "unknown". */
export function bolAgreement(typed: string | null | undefined, geo: string[]): "same" | "different" | "unknown" {
  const t = String(typed ?? "").trim().toLowerCase();
  if (!t || geo.length === 0) return "unknown";
  return geo.some((g) => g.trim().toLowerCase() === t) ? "same" : "different";
}
