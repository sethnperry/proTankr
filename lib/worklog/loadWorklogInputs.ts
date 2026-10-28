// lib/worklog/loadWorklogInputs.ts
//
// Gathers a driver's trips and personal purchases for a date range and shapes them for
// buildWorklog. Takes the Supabase client as an argument so the app (as the driver) and the
// emailer (service role) share one reader.

import { localMidnightMs, addDays } from "./time.ts";
import type { WlPurchase, WlStop, WlTrip } from "./buildWorklog.ts";

type Client = { from: (t: string) => any };

export type LoadOptions = {
  userId: string; range: { start: string; end: string }; tz: string;
  /** Loaded miles for a trip (telematics), when the caller can work them out. */
  loadedMilesFor?: (t: { tripId: string; truckId: string | null; loadedFrom: string | null; loadedTo: string | null }) => Promise<number | null>;
};

export async function loadWorklogInputs(c: Client, o: LoadOptions): Promise<{ trips: WlTrip[]; purchases: WlPurchase[] }> {
  const fromIso = new Date(localMidnightMs(addDays(o.range.start, -1), o.tz)).toISOString();
  const toIso = new Date(localMidnightMs(addDays(o.range.end, 2), o.tz)).toISOString();
  const { data: tripRows } = await c.from("trips")
    .select("trip_id, truck_id, trailer_id, status, started_at, completed_at, begin_miles, end_miles, trip_orders(order_number, is_primary), trip_pickups(pickup_id, seq, name, city, state, arrived_at, left_at, outcome), trip_deliveries(seq, location_id, one_off_name, arrived_at, left_at, status)")
    .eq("driver_id", o.userId).gte("started_at", fromIso).lte("started_at", toIso).not("status", "in", "(cancelled,draft,dispatched)");
  const raw = (tripRows ?? []) as any[];
  const tripIds = raw.map((t) => t.trip_id as string);
  const locIds = [...new Set(raw.flatMap((t) => (t.trip_deliveries ?? []).map((d: any) => d.location_id).filter(Boolean)))] as string[];
  const trailerIds = [...new Set(raw.map((t) => t.trailer_id).filter(Boolean))] as string[];
  const [locs, comps, prods, tcs] = await Promise.all([
    locIds.length ? c.from("delivery_locations").select("location_id, name, location_number").in("location_id", locIds) : Promise.resolve({ data: [] }),
    tripIds.length ? c.from("trip_compartment_loads").select("trip_id, pickup_id, comp_number, product_id, gross_gallons, net_gallons, disposition").in("trip_id", tripIds) : Promise.resolve({ data: [] }),
    c.from("products").select("product_id, product_name, display_name, button_code"),
    trailerIds.length ? c.from("trailer_compartments").select("trailer_id, comp_number").in("trailer_id", trailerIds) : Promise.resolve({ data: [] }),
  ]);
  const loc = new Map(((locs.data ?? []) as any[]).map((l) => [l.location_id as string, l]));
  const prod = new Map(((prods.data ?? []) as any[]).map((p) => [p.product_id as string, p]));
  const compCount = new Map<string, number>();
  for (const r of (tcs.data ?? []) as any[]) compCount.set(r.trailer_id, (compCount.get(r.trailer_id) ?? 0) + 1);
  const compsBy = new Map<string, any[]>();
  for (const x of (comps.data ?? []) as any[]) if (x.disposition !== "cancelled") compsBy.set(x.trip_id, [...(compsBy.get(x.trip_id) ?? []), x]);

  const trips: WlTrip[] = [];
  for (const t of raw) {
    const cl = compsBy.get(t.trip_id) ?? [];
    const pickups = ((t.trip_pickups ?? []) as any[]).sort((a, b) => a.seq - b.seq);
    const deliveries = ((t.trip_deliveries ?? []) as any[]).filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
    const stops: WlStop[] = [
      ...pickups.map((p) => ({ kind: "pickup" as const, name: p.name ?? "Terminal", city: p.city ?? null, state: p.state ?? null, arrivedAt: p.arrived_at ?? null, leftAt: p.left_at ?? null, noLoad: p.outcome === "no_load" })),
      ...deliveries.map((d) => { const l = d.location_id ? loc.get(d.location_id) : null; return { kind: "delivery" as const, name: l?.name ?? d.one_off_name ?? "Delivery", number: l?.location_number ?? null, arrivedAt: d.arrived_at ?? null, leftAt: d.left_at ?? null }; }),
    ];
    const loadedPickups = pickups.filter((p) => p.outcome !== "no_load" && cl.some((x) => x.pickup_id === p.pickup_id));
    const loadedFrom = loadedPickups.map((p) => p.left_at).filter(Boolean).sort()[0] ?? null;
    const loadedTo = deliveries.map((d) => d.arrived_at).filter(Boolean).sort().slice(-1)[0] ?? null;
    let loadedMiles: number | null = null;
    if (o.loadedMilesFor && loadedFrom && loadedTo) loadedMiles = await o.loadedMilesFor({ tripId: t.trip_id, truckId: t.truck_id ?? null, loadedFrom, loadedTo }).catch(() => null);
    trips.push({
      tripId: t.trip_id,
      orders: ((t.trip_orders ?? []) as any[]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((x) => String(x.order_number)).filter(Boolean),
      startedAt: t.started_at, endedAt: t.completed_at ?? null,
      beginMiles: t.begin_miles != null ? Number(t.begin_miles) : null, endMiles: t.end_miles != null ? Number(t.end_miles) : null, loadedMiles,
      compCount: compCount.get(t.trailer_id) ?? 0, loadCount: loadedPickups.length,
      loads: cl.map((x) => { const p = prod.get(x.product_id); return { comp: Number(x.comp_number), code: String(p?.button_code ?? (p?.product_name ?? "").split(" ")[0] ?? "PRD").toUpperCase(), name: p?.display_name ?? p?.product_name ?? "Product", gross: Number(x.gross_gallons ?? 0), net: Number(x.net_gallons ?? 0) }; }),
      stops,
    });
  }

  const { data: fuel } = await c.from("fuel_purchases")
    .select("id, started_at, finished_at, store_name, store_number, city, state, diesel_gallons, pay_kind, status")
    .eq("driver_id", o.userId).in("pay_kind", ["personal_card", "cash"]).gte("started_at", fromIso).lte("started_at", toIso).neq("status", "fueling");
  const fuelRows = (fuel ?? []) as any[];
  const { data: pays } = fuelRows.length ? await c.from("fuel_purchase_payments").select("purchase_id, total_amount").in("purchase_id", fuelRows.map((f) => f.id)) : { data: [] };
  const amt = new Map(((pays ?? []) as any[]).map((p) => [p.purchase_id as string, p.total_amount != null ? Number(p.total_amount) : null]));
  const purchases: WlPurchase[] = fuelRows.map((f) => ({
    at: f.finished_at ?? f.started_at, store: `${f.store_name ?? "Fuel stop"}${f.store_number ? ` #${f.store_number}` : ""}`, place: [f.city, f.state].filter(Boolean).join(", "),
    gallons: f.diesel_gallons != null ? Number(f.diesel_gallons) : null, kind: f.pay_kind, amount: amt.get(f.id) ?? null,
  }));
  return { trips, purchases };
}
