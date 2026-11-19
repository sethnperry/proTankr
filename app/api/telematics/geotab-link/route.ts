// app/api/telematics/geotab-link/route.ts
//
// GET ?companyId=&truckId= -> { url }
// The link behind "Track in Geotab": the truck's own page in Geotab's map when it is linked to a Geotab vehicle, else the
// company's Geotab home, else null (no connection). Any member of the company. It only reads our own tables, so it
// never spends a Geotab call.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.role && !r.superAdmin) return NextResponse.json({ error: "Not in this company." }, { status: 403 });
  try {
    const admin = getServiceSupabase();
    const { data: c } = await admin.from("telematics_connections").select("database_name, status").eq("company_id", companyId).maybeSingle();
    const conn = c as { database_name?: string; status?: string } | null;
    if (!conn || conn.status !== "active" || !conn.database_name) return NextResponse.json({ url: null });
    const db = encodeURIComponent(conn.database_name);
    const truckId = req.nextUrl.searchParams.get("truckId");
    if (truckId) {
      const { data: m } = await admin.from("telematics_vehicle_map").select("provider_vehicle_id").eq("company_id", companyId).eq("truck_id", truckId).maybeSingle();
      const vid = (m as { provider_vehicle_id?: string } | null)?.provider_vehicle_id;
      if (vid) return NextResponse.json({ url: `https://my.geotab.com/${db}/#vehicle,id:${encodeURIComponent(vid)}` });
    }
    return NextResponse.json({ url: `https://my.geotab.com/${db}/` });
  } catch {
    return NextResponse.json({ url: null });
  }
}
