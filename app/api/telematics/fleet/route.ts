// app/api/telematics/fleet/route.ts
//
// GET ?companyId= -> { connected, positions: { [truckId]: { lat, lon, speedMph, at } } }
// Every linked truck's position in one provider call, for the Dispatch board's
// live dots. Staff only. Fails soft ({ connected: false }).

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, providerFor, trailerNames } from "@/lib/telematics/server";

export const runtime = "nodejs";

const STAFF = new Set(["admin", "owner", "dispatch", "lead"]);

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.superAdmin && !(r.role && STAFF.has(r.role))) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  try {
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    const [pos, map, attached, tmap] = await Promise.all([
      p.positions(),
      getServiceSupabase().from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId),
      p.attachedTrailers().catch(() => new Map<string, string>()),
      trailerNames(companyId),
    ]);
    const positions: Record<string, { lat: number; lon: number; speedMph: number | null; at: string | null; trailerId?: string | null }> = {};
    for (const m of (map.data ?? []) as { provider_vehicle_id: string; truck_id: string }[]) {
      const x = pos.get(m.provider_vehicle_id);
      if (x && x.lat != null && x.lon != null) positions[m.truck_id] = { lat: x.lat, lon: x.lon, speedMph: x.speedMph, at: x.at, trailerId: tmap.get(attached.get(m.provider_vehicle_id) ?? "")?.trailerId ?? null };
    }
    return NextResponse.json({ connected: true, positions });
  } catch (e) {
    console.warn("[telematics] fleet positions failed:", (e as Error).message);
    return NextResponse.json({ connected: false });
  }
}
