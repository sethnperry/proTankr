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
