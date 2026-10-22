// app/api/telematics/discover/route.ts
//
// GET ?truckId= -> what the company's telematics provider actually reports for that truck's
// vehicle: its record fields, live status, every reading logged in the last 3 days (with the
// latest value), and counts of fault codes, trips and so on. For deciding what to build, not
// for drivers: company admins only. It makes several provider calls, so it's on request only.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, isCompanyAdmin, providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const truckId = req.nextUrl.searchParams.get("truckId");
  if (!truckId) return NextResponse.json({ error: "truckId is required." }, { status: 400 });
  try {
    const admin = getServiceSupabase();
    const { data: t } = await admin.from("trucks").select("company_id").eq("truck_id", truckId).maybeSingle();
    const companyId = (t as { company_id?: string } | null)?.company_id;
    if (!companyId) return NextResponse.json({ error: "Truck not found." }, { status: 404 });
    if (!isCompanyAdmin(await companyRole(uid, companyId))) return NextResponse.json({ error: "Company admins only." }, { status: 403 });
    const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
    const vid = (m as { provider_vehicle_id?: string } | null)?.provider_vehicle_id;
    if (!vid) return NextResponse.json({ error: "This truck isn't linked to a vehicle yet." }, { status: 404 });
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ error: "No active telematics connection." }, { status: 404 });
    if (req.nextUrl.searchParams.get("mode") === "shipments") {
      const days = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14));
      return NextResponse.json(await p.shipmentTimeline(vid, days));
    }
    return NextResponse.json(await p.discover(vid));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e).slice(0, 200) }, { status: 502 });
  }
}
