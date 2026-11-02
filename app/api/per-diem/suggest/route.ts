// app/api/per-diem/suggest/route.ts
//
// Suggests which of the driver's recent days were away from home base, and where. Only for the signed-in driver
// and only their own days. The source ladder: the truck's GPS (Geotab) if the company has a telematics link, else
// the cities on the driver's trips. Nothing is saved here; the driver claims a day in the app.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, providerFor } from "@/lib/telematics/server";
import { classifyStops, classifyTrail, dayBounds, type DaySuggestion, type TripStop } from "@/lib/perdiem/perDiem";
import { stateCode } from "@/lib/geo/usStates";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

async function reverse(lat: number, lon: number): Promise<{ city: string | null; state: string | null }> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return { city: null, state: null };
  try {
    const r = await fetch(`https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${encodeURIComponent(key)}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    const arr: unknown = await r.json();
    const it = Array.isArray(arr) ? (arr[0] as { name?: unknown; state?: unknown } | undefined) : undefined;
    return { city: typeof it?.name === "string" ? it.name : null, state: stateCode(typeof it?.state === "string" ? it.state : null) };
  } catch { return { city: null, state: null }; }
}

export async function POST(req: NextRequest) {
  const userId = await callerId(req);
  if (!userId) return json({ error: "Not signed in." }, 401);
  const body = (await req.json().catch(() => ({}))) as { days?: unknown; tz?: unknown };
  const tz = typeof body.tz === "string" && body.tz ? body.tz : "America/New_York";
  const days = (Array.isArray(body.days) ? body.days : []).filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 14);
  if (!days.length) return json({ suggestions: [] });

  const admin = getServiceSupabase();
  const { data: st } = await admin.from("user_settings").select("active_company_id").eq("user_id", userId).maybeSingle();
  let companyId = (st as { active_company_id?: string | null } | null)?.active_company_id ?? null;
  if (!companyId) {
    const { data: m } = await admin.from("user_companies").select("company_id").eq("user_id", userId).limit(1).maybeSingle();
    companyId = (m as { company_id?: string } | null)?.company_id ?? null;
  }
  if (!companyId) return json({ suggestions: [] });

  const { data: h } = await admin.from("per_diem_homes").select("city, state, lat, lon, radius_miles").eq("user_id", userId).maybeSingle();
  const home = h as { city: string; state: string; lat: number | null; lon: number | null; radius_miles: number } | null;
  if (!home) return json({ needsHome: true, suggestions: [] });

  const first = dayBounds(days[days.length - 1] < days[0] ? days[days.length - 1] : days[0], tz).fromIso;
  const [tripsRes, mapRes] = await Promise.all([
    admin.from("trips").select("trip_id, truck_id, started_at").eq("driver_id", userId).gte("started_at", new Date(Date.parse(first) - 14 * 86400_000).toISOString()).order("started_at"),
    admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId),
  ]);
  const trips = (tripsRes.data ?? []) as { trip_id: string; truck_id: string | null; started_at: string | null }[];
  const vehicleOf = new Map(((mapRes.data ?? []) as { provider_vehicle_id: string; truck_id: string }[]).map((m) => [m.truck_id, m.provider_vehicle_id]));
  const provider = vehicleOf.size && home.lat != null && home.lon != null ? await providerFor(companyId).catch(() => null) : null;

  // The stops (cities with times) of the driver's trips, for the no-GPS fallback.
  const tripIds = trips.map((t) => t.trip_id);
  const [pk, dl] = tripIds.length ? await Promise.all([
    admin.from("trip_pickups").select("city, state, arrived_at").in("trip_id", tripIds).not("arrived_at", "is", null),
    admin.from("trip_deliveries").select("location_id, arrived_at").in("trip_id", tripIds).not("arrived_at", "is", null),
  ]) : [{ data: [] }, { data: [] }];
  const locIds = [...new Set(((dl.data ?? []) as { location_id: string | null }[]).map((d) => d.location_id).filter(Boolean) as string[])];
  const { data: locs } = locIds.length ? await admin.from("delivery_locations").select("location_id, city, state").in("location_id", locIds) : { data: [] };
  const locPlace = new Map(((locs ?? []) as { location_id: string; city: string | null; state: string | null }[]).map((l) => [l.location_id, l]));
  const stops: TripStop[] = [
    ...((pk.data ?? []) as { city: string | null; state: string | null; arrived_at: string }[]).map((p) => ({ city: p.city, state: p.state, at: p.arrived_at })),
    ...((dl.data ?? []) as { location_id: string | null; arrived_at: string }[]).map((d) => ({ city: (d.location_id && locPlace.get(d.location_id)?.city) || null, state: (d.location_id && locPlace.get(d.location_id)?.state) || null, at: d.arrived_at })),
  ];

  const one = async (day: string): Promise<DaySuggestion> => {
    const { fromIso, toIso } = dayBounds(day, tz);
    // GPS first: the truck the driver used that day (else the one from their latest earlier trip).
    if (provider && home.lat != null && home.lon != null) {
      const that = trips.filter((t) => t.started_at && t.started_at >= fromIso && t.started_at < toIso && t.truck_id);
      const truck = that[0]?.truck_id ?? [...trips].reverse().find((t) => t.started_at && t.started_at < fromIso && t.truck_id)?.truck_id ?? null;
      const vid = truck ? vehicleOf.get(truck) : null;
      if (vid) {
        const trail = await provider.trail(vid, fromIso, toIso).catch(() => []);
        if (trail.length) {
          const c = classifyTrail(trail, { lat: home.lat, lon: home.lon, radiusMiles: home.radius_miles });
          if (!c.away) return { day, away: false, city: null, state: null, source: "geotab", detail: null };
          const place = c.last ? await reverse(c.last.lat, c.last.lon) : { city: null, state: null };
          return { day, away: true, city: place.city, state: place.state, source: "geotab", detail: `${c.farthestMi} mi from home` };
        }
      }
    }
    const dayStops = stops.filter((s) => s.at && s.at >= fromIso && s.at < toIso);
    if (dayStops.length) {
      const c = classifyStops(dayStops, home);
      return { day, away: c.away, city: c.city, state: c.state, source: "app", detail: c.away ? "A stop on your trips" : null };
    }
    return { day, away: false, city: null, state: null, source: null, detail: null };
  };

  const out: DaySuggestion[] = [];
  const started = Date.now();
  for (let i = 0; i < days.length; i += 4) {
    if (Date.now() - started > 45_000) break;
    out.push(...(await Promise.all(days.slice(i, i + 4).map(one))));
  }
  return json({ suggestions: out });
}
