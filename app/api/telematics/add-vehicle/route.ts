// app/api/telematics/add-vehicle/route.ts
//
// POST { companyId, vehicleId } or { companyId, trailerProviderId } -> { ok, truckId | trailerId, created }
// Adds one Geotab trailer (name, plus the VIN and plate from its same-named record in the "Trailer" group,
// year / make / model from the VIN) or one Geotab vehicle to ProTankr as a truck, with the fields Geotab has (VIN, plate) and the
// year / make / model decoded from the VIN, and links it. If the company already has a truck with
// the same VIN or number, that truck is linked instead of a duplicate being created (blank fields
// are filled, nothing is overwritten). Admin, dispatch or lead.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";
import { DEFAULT_OPTS, truckPatch, type TruckRow } from "@/lib/telematics/unitSync";
import { decodeVins } from "@/lib/telematics/vinDecode";
import { bestPerName, importableVehicles } from "@/lib/telematics/dedupe";
import { groupNames } from "@/lib/telematics/groups";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { companyId?: string; vehicleId?: string; trailerProviderId?: string };
  if (!body.companyId || (!body.vehicleId && !body.trailerProviderId)) return NextResponse.json({ error: "companyId and a vehicle or trailer are required." }, { status: 400 });
  const r = await companyRole(uid, body.companyId);
  if (!r.superAdmin && !["admin", "owner", "dispatch", "lead"].includes(r.role ?? "")) {
    return NextResponse.json({ error: "Only an admin, dispatcher or lead can add equipment." }, { status: 403 });
  }
  try {
    const admin = getServiceSupabase();
    const p = await providerFor(body.companyId);
    if (!p) return NextResponse.json({ error: "This company has no telematics connection." }, { status: 400 });
    if (body.trailerProviderId) return addTrailer(admin, p, body.companyId, body.trailerProviderId);
    const v = (await p.listVehicles()).find((x) => x.id === body.vehicleId);
    if (!v) return NextResponse.json({ error: "Geotab doesn't list that vehicle." }, { status: 404 });

    const { data: linked } = await admin.from("telematics_vehicle_map").select("truck_id").eq("company_id", body.companyId).eq("provider_vehicle_id", v.id).maybeSingle();
    if ((linked as { truck_id?: string } | null)?.truck_id) return NextResponse.json({ ok: true, truckId: (linked as { truck_id: string }).truck_id, created: false });

    const COLS = "truck_id, truck_name, vin_number, plate_number, make, model, year, region";
    const { data: ours } = await admin.from("trucks").select(COLS).eq("company_id", body.companyId);
    const rows = (ours ?? []) as TruckRow[];
    const lower = (x: string) => x.trim().toLowerCase();
    const hit = (v.vin && rows.find((t) => t.vin_number && t.vin_number.toUpperCase() === v.vin)) || rows.find((t) => lower(t.truck_name) === lower(v.name)) || null;

    const info = v.vin ? (await decodeVins([v.vin])).get(v.vin) : undefined;
    const opts = { ...DEFAULT_OPTS, existing: "fill" as const };
    const patch = truckPatch(hit, { vin: v.vin, plate: v.plate ?? null }, info, null, opts);

    let truckId: string;
    let created = false;
    if (hit) {
      truckId = hit.truck_id;
      if (Object.keys(patch).length) await admin.from("trucks").update(patch).eq("truck_id", truckId).eq("company_id", body.companyId);
    } else {
      const { data, error } = await admin.from("trucks").insert({ company_id: body.companyId, truck_name: v.name.trim(), active: true, ...patch }).select("truck_id").single();
      if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't add the truck." }, { status: 400 });
      truckId = (data as { truck_id: string }).truck_id;
      created = true;
    }
    // One truck per Geotab vehicle and the other way round.
    await admin.from("telematics_vehicle_map").delete().eq("company_id", body.companyId).eq("truck_id", truckId);
    const { error: me } = await admin.from("telematics_vehicle_map").insert({ company_id: body.companyId, provider_vehicle_id: v.id, truck_id: truckId, vehicle_name: v.name, matched_by: "import" });
    if (me) return NextResponse.json({ error: `Added the truck but couldn't link it: ${me.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, truckId, created, filled: Object.keys(patch) });
  } catch (e) {
    console.warn("[telematics] add-vehicle failed:", (e as Error).message);
    return NextResponse.json({ error: "Geotab didn't answer. Try again in a moment." }, { status: 502 });
  }
}

const blank = (x: unknown) => x == null || String(x).trim() === "";

async function addTrailer(admin: ReturnType<typeof getServiceSupabase>, p: NonNullable<Awaited<ReturnType<typeof providerFor>>>, companyId: string, providerTrailerId: string) {
  const [trailers, vehicles, groups] = await Promise.all([p.listTrailers(), p.listVehicles(), p.listGroups().catch(() => [])]);
  const t = trailers.find((x) => x.id === providerTrailerId);
  if (!t) return NextResponse.json({ error: "Geotab doesn't list that trailer." }, { status: 404 });

  const { data: linked } = await admin.from("telematics_trailer_map").select("trailer_id").eq("company_id", companyId).eq("provider_trailer_id", t.id).maybeSingle();
  if ((linked as { trailer_id?: string } | null)?.trailer_id) return NextResponse.json({ ok: true, trailerId: (linked as { trailer_id: string }).trailer_id, created: false });

  // The VIN and plate live on the same-named vehicle record in the "Trailer" group.
  const dev = bestPerName(importableVehicles(vehicles).filter((v) => groupNames(v.groupIds, groups).some((n) => n.trim().toLowerCase() === "trailer") && v.name.trim().toLowerCase() === t.name.trim().toLowerCase()))[0];
  const vin = dev?.vin ?? null, plate = dev?.plate ?? null;
  const info = vin ? (await decodeVins([vin])).get(vin) : undefined;
  const want: Record<string, unknown> = {};
  if (vin) want.vin_number = vin;
  if (plate) want.plate_number = plate;
  if (info?.make) want.make = info.make;
  if (info?.model) want.model = info.model;
  if (info?.year) want.year = info.year;

  const { data: ours } = await admin.from("trailers").select("trailer_id, trailer_name, vin_number, plate_number, make, model, year").eq("company_id", companyId);
  const rows = (ours ?? []) as Record<string, any>[];
  const hit = (vin && rows.find((x) => x.vin_number && String(x.vin_number).toUpperCase() === vin)) || rows.find((x) => String(x.trailer_name).trim().toLowerCase() === t.name.trim().toLowerCase()) || null;

  let trailerId: string, created = false;
  if (hit) {
    trailerId = hit.trailer_id;
    const patch = Object.fromEntries(Object.entries(want).filter(([k]) => blank(hit[k]))); // fill blanks, never overwrite
    if (Object.keys(patch).length) await admin.from("trailers").update(patch).eq("trailer_id", trailerId).eq("company_id", companyId);
  } else {
    const { data, error } = await admin.from("trailers").insert({ company_id: companyId, trailer_name: t.name.trim(), active: true, ...want }).select("trailer_id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't add the trailer." }, { status: 400 });
    trailerId = (data as { trailer_id: string }).trailer_id;
    created = true;
  }
  await admin.from("telematics_trailer_map").delete().eq("company_id", companyId).eq("trailer_id", trailerId);
  const { error: me } = await admin.from("telematics_trailer_map").insert({ company_id: companyId, provider_trailer_id: t.id, trailer_id: trailerId, trailer_name: t.name, matched_by: "import" });
  if (me) return NextResponse.json({ error: `Added the trailer but couldn't link it: ${me.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, trailerId, created, filled: Object.keys(want) });
}
