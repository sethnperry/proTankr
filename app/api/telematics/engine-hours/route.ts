// app/api/telematics/engine-hours/route.ts
//
// GET ?companyId= -> { connected, hours: { [truckId]: engineHours } }
// The hour meter of every linked truck, for service-due by engine hours on the
// Dispatch Dashboard. Only runs when the company has an active service type that
// counts engine hours (otherwise there is nothing to compute). Staff only;
// cached ten minutes. Soft fail.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";

const STAFF = new Set(["admin", "owner", "dispatch", "lead"]);
const TTL_MS = 600_000;
const cache = new Map<string, { at: number; hours: Record<string, number> }>();

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.superAdmin && !(r.role && STAFF.has(r.role))) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ connected: true, hours: hit.hours });
  try {
    const admin = getServiceSupabase();
    const { data: types } = await admin.from("service_types").select("service_type_id").eq("company_id", companyId).eq("is_active", true).eq("interval_kind", "hours").in("applies_to", ["truck", "both"]);
    if (!(types ?? []).length) return NextResponse.json({ connected: true, hours: {} });
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    const { data: map } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId);
    const rows = (map ?? []) as { provider_vehicle_id: string; truck_id: string }[];
    const hours: Record<string, number> = {};
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(rows.slice(i, i + 4).map(async (m) => {
        try { const h = await p.engineHours(m.provider_vehicle_id); if (h != null) hours[m.truck_id] = h; } catch { /* that truck shows no hours */ }
      }));
    }
    cache.set(companyId, { at: Date.now(), hours });
    return NextResponse.json({ connected: true, hours });
  } catch (e) {
    console.warn("[telematics] engine hours failed:", (e as Error).message);
    return NextResponse.json({ connected: false });
  }
}
