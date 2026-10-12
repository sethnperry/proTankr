// app/api/geocode/route.ts
//
// City/state -> lat/lon for delivery locations (docs/trip-workflow-design.md
// §4: Near Me needs coordinates). OpenWeather's direct geocoder, the same one
// /api/fuel-temp already uses; city precision is plenty for a 150-mile radius.
// Signed-in callers only, so the API key can't be used by anyone.
//
// Reverse mode (?lat=&lon=) returns { city, state } for Start Load's
// "Starting from" field (the phone's location -> nearest city).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stateCode } from "@/lib/geo/usStates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const city = (sp.get("city") ?? "").trim();
  const state = (sp.get("state") ?? "").trim();
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const reverse = sp.has("lat") && sp.has("lon") && Number.isFinite(lat) && Number.isFinite(lon);
  if (!reverse && (!city || !state)) return NextResponse.json({ error: "city and state, or lat and lon, are required." }, { status: 400 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: who } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (!who?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENWEATHER_API_KEY not set." }, { status: 500 });

  if (reverse) {
    const r = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (!r.ok) return NextResponse.json({ error: "Geocoder unavailable." }, { status: 502 });
    const arr: unknown = await r.json();
    const it = Array.isArray(arr) ? (arr[0] as { name?: unknown; state?: unknown } | undefined) : undefined;
    const name = typeof it?.name === "string" ? it.name : null;
    if (!name) return NextResponse.json({ error: "No city found here." }, { status: 404 });
    return NextResponse.json({ city: name, state: stateCode(typeof it?.state === "string" ? it.state : null) });
  }

  const q = encodeURIComponent(`${city},${state},US`);
  const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Geocoder unavailable." }, { status: 502 });
  const json: unknown = await res.json();
  const item = Array.isArray(json) ? (json[0] as { lat?: unknown; lon?: unknown } | undefined) : undefined;
  const la = Number(item?.lat);
  const lo = Number(item?.lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return NextResponse.json({ error: "City not found." }, { status: 404 });
  return NextResponse.json({ lat: la, lon: lo });
}
