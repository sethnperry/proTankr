// app/api/telematics/connect/route.ts
//
// GET  ?companyId=  -> connection status + matched / unmatched vehicles (admin)
// POST {companyId, database, userName, password} -> verify the sign-in, store it
//      encrypted, match vehicles to trucks (admin)
// POST {companyId, map: [{vehicleId, truckId|null}]} -> manual matches (admin)
// DELETE {companyId} -> disconnect (admin)

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { geotabProvider } from "@/lib/telematics/geotab";
import { encryptSecret } from "@/lib/telematics/crypto";
import { matchVehicles, type TruckLite } from "@/lib/telematics/match";
import { TelematicsAuthError } from "@/lib/telematics/types";
import { callerId, companyRole, isCompanyAdmin, providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";

async function gate(req: NextRequest, companyId: string | null) {
  const uid = await callerId(req);
  if (!uid) return { err: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  if (!companyId) return { err: NextResponse.json({ error: "companyId is required." }, { status: 400 }) };
  if (!isCompanyAdmin(await companyRole(uid, companyId))) return { err: NextResponse.json({ error: "Admins only." }, { status: 403 }) };
  return { uid, companyId };
}

async function trucksOf(companyId: string): Promise<TruckLite[]> {
  const { data } = await getServiceSupabase().from("trucks").select("truck_id, truck_name, vin_number").eq("company_id", companyId).eq("active", true);
  return (data ?? []) as TruckLite[];
}

async function summary(companyId: string) {
  const admin = getServiceSupabase();
  const { data: conn } = await admin.from("telematics_connections").select("provider, database_name, user_name, status, last_error, last_ok_at").eq("company_id", companyId).maybeSingle();
  if (!conn) return { connected: false };
  const [trucks, map] = await Promise.all([
    trucksOf(companyId),
    admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id, vehicle_name, matched_by").eq("company_id", companyId),
  ]);
  const rows = (map.data ?? []) as { provider_vehicle_id: string; truck_id: string; vehicle_name: string | null; matched_by: string }[];
  const mapped = new Set(rows.map((r) => r.truck_id));
  let vehicles: { id: string; name: string }[] = [];
  try {
    const p = await providerFor(companyId);
    vehicles = p ? (await p.listVehicles()).map((v) => ({ id: v.id, name: v.name })) : [];
  } catch { /* the status line already carries the last error */ }
  const mappedVeh = new Set(rows.map((r) => r.provider_vehicle_id));
  return {
    connected: true, ...conn,
    matched: rows.map((r) => ({ vehicleId: r.provider_vehicle_id, vehicleName: r.vehicle_name, truckId: r.truck_id, truckName: trucks.find((t) => t.truck_id === r.truck_id)?.truck_name ?? "?", by: r.matched_by })),
    unmatchedTrucks: trucks.filter((t) => !mapped.has(t.truck_id)).map((t) => ({ truckId: t.truck_id, truckName: t.truck_name })),
    unmatchedVehicles: vehicles.filter((v) => !mappedVeh.has(v.id)),
  };
}

export async function GET(req: NextRequest) {
  const g = await gate(req, req.nextUrl.searchParams.get("companyId"));
  if ("err" in g) return g.err;
  return NextResponse.json(await summary(g.companyId));
}

export async function POST(req: NextRequest) {
  const body: any = await req.json().catch(() => ({}));
  const g = await gate(req, body.companyId ?? null);
  if ("err" in g) return g.err;
  const admin = getServiceSupabase();

  if (Array.isArray(body.map)) {
    for (const m of body.map as { vehicleId: string; vehicleName?: string; truckId: string | null }[]) {
      if (!m.vehicleId) continue;
      await admin.from("telematics_vehicle_map").delete().eq("company_id", g.companyId).eq("provider_vehicle_id", m.vehicleId);
      if (m.truckId) {
        await admin.from("telematics_vehicle_map").delete().eq("company_id", g.companyId).eq("truck_id", m.truckId);
        const { error } = await admin.from("telematics_vehicle_map").insert({ company_id: g.companyId, provider_vehicle_id: m.vehicleId, truck_id: m.truckId, vehicle_name: m.vehicleName ?? null, matched_by: "manual" });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json(await summary(g.companyId));
  }

  const database = String(body.database ?? "").trim(), userName = String(body.userName ?? "").trim(), password = String(body.password ?? "");
  if (!database || !userName || !password) return NextResponse.json({ error: "Database, user name and password are required." }, { status: 400 });
  try {
    const vehicles = await geotabProvider({ database, userName, password }).listVehicles();
    const { pairs } = matchVehicles(vehicles, await trucksOf(g.companyId));
    const { error } = await admin.from("telematics_connections").upsert({
      company_id: g.companyId, provider: "geotab", database_name: database, user_name: userName,
      credentials_enc: encryptSecret(password), status: "active", last_error: null, last_ok_at: new Date().toISOString(),
      connected_by: g.uid, updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await admin.from("telematics_vehicle_map").delete().eq("company_id", g.companyId).neq("matched_by", "manual");
    for (const p of pairs) {
      await admin.from("telematics_vehicle_map").upsert({ company_id: g.companyId, provider_vehicle_id: p.vehicle.id, truck_id: p.truck.truck_id, vehicle_name: p.vehicle.name, vin: p.vehicle.vin, matched_by: p.by }, { onConflict: "company_id,provider_vehicle_id", ignoreDuplicates: true });
    }
    return NextResponse.json(await summary(g.companyId));
  } catch (e) {
    const msg = e instanceof TelematicsAuthError ? "Geotab didn't accept that database, user name or password." : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: e instanceof TelematicsAuthError ? 401 : 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const body: any = await req.json().catch(() => ({}));
  const g = await gate(req, body.companyId ?? null);
  if ("err" in g) return g.err;
  const admin = getServiceSupabase();
  await admin.from("telematics_vehicle_map").delete().eq("company_id", g.companyId);
  await admin.from("telematics_connections").delete().eq("company_id", g.companyId);
  return NextResponse.json({ connected: false });
}
