// app/api/telematics/shipments/route.ts
//
// GET ?truckId=&since=ISO -> { connected, shipments: [{ documentNumber, start, shipperName, commodity }] }
// The shipment numbers (BOLs) entered in the telematics Drive app on a truck since a time (at most
// 7 days back). One provider call. Any member of the truck's company. Fails soft.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const truckId = req.nextUrl.searchParams.get("truckId");
  if (!truckId) return NextResponse.json({ error: "truckId is required." }, { status: 400 });
  const maxBack = Date.now() - 7 * 86400000;
  const since = Math.max(maxBack, Date.parse(req.nextUrl.searchParams.get("since") ?? "") || maxBack);
  try {
    const admin = getServiceSupabase();
    const { data: t } = await admin.from("trucks").select("company_id").eq("truck_id", truckId).maybeSingle();
    const companyId = (t as { company_id?: string } | null)?.company_id;
    if (!companyId) return NextResponse.json({ connected: false });
    const r = await companyRole(uid, companyId);
    if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
    const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
    const vid = (m as { provider_vehicle_id?: string } | null)?.provider_vehicle_id;
    if (!vid) return NextResponse.json({ connected: false });
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    return NextResponse.json({ connected: true, shipments: await p.shipmentsSince(vid, new Date(since).toISOString()) });
  } catch (e) {
    console.warn("[telematics] shipments failed:", (e as Error).message);
    return NextResponse.json({ connected: false });
  }
}
