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
