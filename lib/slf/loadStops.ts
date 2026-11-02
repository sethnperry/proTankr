// lib/slf/loadStops.ts
//
// Turns trip pickups and deliveries into stops with a state and county: a delivery's county is on its saved
// location; a terminal's comes from the server's cache (which fills it in on first use). Browser only.

import { supabase } from "@/lib/supabase/client";
import type { TripDeliveryRow, TripPickupRow } from "@/lib/trips/types";
import type { TripStop } from "./slf";

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function stopsFor(pickups: TripPickupRow[], deliveries: TripDeliveryRow[]): Promise<Map<string, TripStop[]>> {
  const locIds = [...new Set(deliveries.map((d) => d.location_id).filter(Boolean) as string[])];
  const termIds = [...new Set(pickups.map((p) => p.terminal_id).filter(Boolean) as string[])];
  const locs = new Map<string, { name: string; state: string | null; county: string | null }>();
  for (const part of chunk(locIds, 150)) {
    const { data } = await supabase.from("delivery_locations").select("location_id, name, state, county").in("location_id", part);
    for (const l of (data ?? []) as any[]) locs.set(l.location_id, { name: l.name, state: l.state ?? null, county: l.county ?? null });
  }
  const terms = new Map<string, { county: string | null; state: string | null }>();
  for (const part of chunk(termIds, 150)) {
    const { data } = await supabase.from("terminal_counties").select("terminal_id, county, state").in("terminal_id", part);
    for (const r of (data ?? []) as any[]) terms.set(r.terminal_id, { county: r.county, state: r.state });
  }
  const missing = termIds.filter((t) => !terms.has(t));
  if (missing.length) {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const res = await fetch("/api/slf/terminal-counties", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sess.session?.access_token ?? ""}` }, body: JSON.stringify({ terminalIds: missing.slice(0, 40) }) });
      if (res.ok) for (const [id, v] of Object.entries((await res.json()).counties ?? {})) terms.set(id, v as { county: string | null; state: string | null });
    } catch { /* the county is simply unknown for now */ }
  }
  const out = new Map<string, TripStop[]>();
  const push = (tripId: string, s: TripStop) => out.set(tripId, [...(out.get(tripId) ?? []), s]);
  for (const p of pickups) {
    const t = p.terminal_id ? terms.get(p.terminal_id) : null;
    push(p.trip_id, { kind: "pickup", name: p.name ?? "Rack", state: t?.state ?? p.state, county: t?.county ?? null, arrivedAt: p.arrived_at });
  }
  for (const d of deliveries) {
    const l = d.location_id ? locs.get(d.location_id) : null;
    push(d.trip_id, { kind: "delivery", name: l?.name ?? d.one_off_name ?? "Delivery", state: l?.state ?? null, county: l?.county ?? null, arrivedAt: d.arrived_at });
  }
  return out;
}
