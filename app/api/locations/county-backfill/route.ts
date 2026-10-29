// app/api/locations/county-backfill/route.ts
//
// Fills in the county for the signed-in driver's company locations that don't have one yet, a few at
// a time (each is a lookup from its coordinates; a location with none is geocoded from its city first).
// Runs as the caller, so row-level security keeps it to their own company. The Delivery Locations page
// calls it until nothing is left.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { countyForPlace } from "@/lib/geo/county";

export const runtime = "nodejs";
const BATCH = 12;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const sb = createClient(url, anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: who } = await sb.auth.getUser(token);
  if (!who?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data, error } = await sb.from("delivery_locations").select("location_id, address, city, state, zip, lat, lon")
    .is("county", null).eq("is_active", true).limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { location_id: string; address: string | null; city: string | null; state: string | null; zip: string | null; lat: number | null; lon: number | null }[];
  const key = process.env.OPENWEATHER_API_KEY;
  let done = 0;
  for (const r of rows) {
    // By the address when there is one; the stored point is not trusted (it may be a phone pin taken off site),
    // so the city's own center is the fallback.
    let center: { lat: number; lon: number } | null = null;
    if (key && r.city && r.state) {
      try {
        const g = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(`${r.city},${r.state},US`)}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" });
        const j = (await g.json()) as { lat?: number; lon?: number }[];
        if (Array.isArray(j) && j[0]) center = { lat: Number(j[0].lat), lon: Number(j[0].lon) };
      } catch { /* leave blank */ }
    }
    const county = await countyForPlace({ address: r.address, city: r.city, state: r.state, zip: r.zip }, center);
    // A location that can't be resolved gets "" so the sweep doesn't retry it forever; the app reads that as "No county".
    const { error: e } = await sb.from("delivery_locations").update({ county: county ?? "" }).eq("location_id", r.location_id);
    if (!e) done += 1;
  }
  const { count } = await sb.from("delivery_locations").select("location_id", { count: "exact", head: true }).is("county", null).eq("is_active", true);
  return NextResponse.json({ done, remaining: count ?? 0 });
}
