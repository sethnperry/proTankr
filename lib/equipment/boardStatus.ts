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

/** Two-letter terminal code, the same one My Terminals shows ("Buckey North" -> "BN"). */
export function terminalCode(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** "BN · Tampa" for a terminal, "Love's 495 · Tampa" for a store; the city is dropped when there isn't one. */
export function placeLine(kind: "terminal" | "store", name: string, city: string | null | undefined): string {
  const head = kind === "terminal" ? terminalCode(name) : name.trim();
  const c = (city ?? "").trim();
  return c ? `${head} · ${c}` : head;
}

/** Where an empty trailer last was: whichever finished stop is newest. */
export function lastPlace(stops: { at: string | null; line: string }[]): string | null {
  let best: { at: string; line: string } | null = null;
  for (const s of stops) if (s.at && (!best || s.at > best.at)) best = { at: s.at, line: s.line };
  return best?.line ?? null;
}

/** "Love's" + "495" -> "Love's 495"; nothing added when the name already carries the number. */
export function storeLabel(name: string | null | undefined, number: string | null | undefined): string {
  const n = String(name ?? "").trim();
  const num = String(number ?? "").trim();
  if (!num || n.toLowerCase().includes(num.toLowerCase())) return n;
  return n ? `${n} ${num}` : num;
}
