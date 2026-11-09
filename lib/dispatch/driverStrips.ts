// lib/dispatch/driverStrips.ts
//
// One terminal-access strip per city a driver is carded in, built the way the
// driver's own dashboard builds it (lib/terminals/readiness.ts). Pure.
import { terminalReadiness, type ReadinessInput, type ReadinessSummary } from "../terminals/readiness.ts";

export type StripTerminal = { terminal_id: string | number; terminal_name: string | null; city: string | null; state: string | null; renewal_days?: number | null };

export function driverCityStrips(
  access: { terminal_id: string; carded_on: string | null }[],
  catalog: StripTerminal[],
  todayIso: string,
): { place: string; summary: ReadinessSummary }[] {
  const carded = new Map<string, string>();
  for (const a of access) if (a.carded_on) carded.set(String(a.terminal_id), a.carded_on);
  const rows: ReadinessInput[] = catalog.map((t) => ({
    terminalId: String(t.terminal_id), name: t.terminal_name ?? "Terminal", city: t.city ?? null, state: t.state ?? null,
    renewalDays: Number(t.renewal_days ?? 90) || 90, cardedOn: carded.get(String(t.terminal_id)) ?? null,
  }));
  const cities = new Map<string, { city: string; state: string }>();
  for (const t of catalog) {
    if (!carded.has(String(t.terminal_id)) || !t.city) continue;
    cities.set(`${t.city.trim().toLowerCase()}|${(t.state ?? "").trim().toLowerCase()}`, { city: t.city, state: t.state ?? "" });
  }
  return [...cities.values()]
    .sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city))
    .map((c) => ({ place: [c.city, c.state].filter(Boolean).join(", "), summary: terminalReadiness(rows, { city: c.city, state: c.state, todayIso }) }));
}

/** How urgent a strip's carded terminals are: fewest days left (expired is negative), or null when none are carded. */
export function stripUrgency(summary: ReadinessSummary): { days: number; name: string } | null {
  let worst: { days: number; name: string } | null = null;
  for (const g of summary.segments) {
    if (g.daysLeft == null || g.state === "none" || g.state === "training") continue;
    if (!worst || g.daysLeft < worst.days) worst = { days: g.daysLeft, name: g.name };
  }
  return worst;
}

/** Most critical city first: the strip whose soonest expiry is nearest (or already past). */
export function byUrgency<T extends { summary: ReadinessSummary }>(strips: T[]): T[] {
  const d = (x: T) => stripUrgency(x.summary)?.days ?? Infinity;
  return [...strips].sort((a, b) => d(a) - d(b));
}

/** Terminals a driver needs to renew now: expired or 7 days or fewer left. */
export function renewalCount(strips: { summary: ReadinessSummary }[]): { count: number; worstDays: number | null } {
  let count = 0, worstDays: number | null = null;
  for (const s of strips) for (const g of s.summary.segments) {
    if (g.daysLeft == null || g.state === "none" || g.state === "training") continue;
    if (g.daysLeft <= 7) { count++; worstDays = worstDays == null ? g.daysLeft : Math.min(worstDays, g.daysLeft); }
  }
  return { count, worstDays };
}
