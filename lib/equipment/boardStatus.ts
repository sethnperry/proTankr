// lib/equipment/boardStatus.ts
//
// Small pure helpers for the equipment board's status lines. No data access.

/** "Seth Perry" -> "SP", "Madonna" -> "M", blank -> "". */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export type LoadedDot = { comp: number; color: string };

/** One dot per loaded compartment, comp 1 on the right like the Planner draws them. */
export function dotsFor(comps: { comp: number; productId: string | null }[], colorOf: (productId: string) => string): LoadedDot[] {
  return comps
    .filter((c) => !!c.productId)
    .sort((a, b) => b.comp - a.comp)
    .map((c) => ({ comp: c.comp, color: colorOf(c.productId as string) }));
}

export type TruckLine = { text: string; tone: "status" | "use" | "none" };

/**
 * Truck's second line. An abnormal fleet status (Readyline, Deadline) wins; a plain
 * in_use unit, or a coupled one, reads "In Use · SP" with the holder's initials.
 */
export function truckLine(opts: { statusLabel: string | null; statusCode: string | null; claimedBy: string | null; initials: string }): TruckLine {
  if (opts.statusCode && opts.statusCode !== "in_use" && opts.statusLabel) return { text: opts.statusLabel, tone: "status" };
  if (opts.claimedBy) return { text: opts.initials ? `In Use · ${opts.initials}` : "In Use", tone: "use" };
  return { text: "", tone: "none" };
}

type TripBits = {
  status: string;
  pickups: { arrived_at: string | null; left_at: string | null; outcome: string | null }[];
  deliveries: { arrived_at: string | null; left_at: string | null; status: string | null; seq: number }[];
};

/** What a driver is doing right now, from their open trip. */
export function driverActivity(t: TripBits | null, fueling: boolean): string | null {
  if (fueling) return "Fueling";
  if (!t) return null;
  if (t.status === "parked") return "Parked";
  if (t.pickups.some((p) => p.arrived_at && !p.left_at && p.outcome !== "no_load")) return "Loading";
  if (t.deliveries.some((d) => d.arrived_at && !d.left_at && d.status !== "complete" && d.status !== "cancelled")) return "Delivering";
  return "En route";
}

/** The next stop still to deliver to (lowest seq not finished). */
export function nextDeliveryIndex(ds: { status: string | null; seq: number }[]): number {
  let best = -1;
  ds.forEach((d, i) => {
    if (d.status === "complete" || d.status === "cancelled") return;
    if (best < 0 || d.seq < ds[best].seq) best = i;
  });
  return best;
}
