// app/api/geocode/route.ts
//
// City/state -> lat/lon for delivery locations (docs/trip-workflow-design.md
// §4: Near Me needs coordinates). OpenWeather's direct geocoder, the same one
// /api/fuel-temp already uses; city precision is plenty for a 150-mile radius.
// Signed-in callers only, so the API key can't be used by anyone.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const city = (req.nextUrl.searchParams.get("city") ?? "").trim();
  const state = (req.nextUrl.searchParams.get("state") ?? "").trim();
  if (!city || !state) return NextResponse.json({ error: "city and state are required." }, { status: 400 });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: who } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  if (!who?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENWEATHER_API_KEY not set." }, { status: 500 });

  const q = encodeURIComponent(`${city},${state},US`);
  const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Geocoder unavailable." }, { status: 502 });
  const json: unknown = await res.json();
  const item = Array.isArray(json) ? (json[0] as { lat?: unknown; lon?: unknown } | undefined) : undefined;
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "City not found." }, { status: 404 });
  return NextResponse.json({ lat, lon });
}
