// app/api/telematics/status/route.ts
//
// GET ?companyId=&truckId= -> { connected, provider, providerName, linked }
// Tells the equipment pop-out whether to show a telematics link, and which one. Any
// member of the company. Never reaches the provider: it only reads our own tables.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, isCompanyAdmin } from "@/lib/telematics/server";

export const runtime = "nodejs";

const NAMES: Record<string, string> = { geotab: "Geotab" };

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const truckId = req.nextUrl.searchParams.get("truckId");
  const r = await companyRole(uid, companyId);
  if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
  try {
    const admin = getServiceSupabase();
    const { data: c } = await admin.from("telematics_connections").select("provider, status").eq("company_id", companyId).maybeSingle();
    const conn = c as { provider?: string; status?: string } | null;
    if (!conn || conn.status !== "active") return NextResponse.json({ connected: false });
    const provider = conn.provider ?? "geotab";
    let linked = false;
    if (truckId) {
      const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
      linked = !!m;
    }
    return NextResponse.json({ connected: true, provider, providerName: NAMES[provider] ?? provider, linked, isAdmin: isCompanyAdmin(r) });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
