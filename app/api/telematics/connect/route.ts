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
import { matchDrivers } from "@/lib/telematics/matchDrivers";
import { groupNames, pathsFor, summarizeGroups } from "@/lib/telematics/groups";
import { bestPerName, importableVehicles } from "@/lib/telematics/dedupe";
import { parseOpts, regionFor, truckPatch, type TruckRow } from "@/lib/telematics/unitSync";
import { decodeVins } from "@/lib/telematics/vinDecode";
import { TelematicsAuthError } from "@/lib/telematics/types";
import { autoLinkAllDrivers, callerId, companyRole, isCompanyAdmin, providerFor, rosterMembers } from "@/lib/telematics/server";

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
  let vehicles: { id: string; name: string; vin?: string | null; plate?: string | null; group?: string; groups?: string[] }[] = [];
  let rawVehicles: import("@/lib/telematics/types").ProviderVehicle[] = [];
  let provGroups: import("@/lib/telematics/types").ProviderGroup[] = [];
  try {
    const p = await providerFor(companyId);
    if (p) {
      rawVehicles = await p.listVehicles();
      provGroups = await p.listGroups().catch(() => []);
      vehicles = importableVehicles(rawVehicles).map((v) => ({ id: v.id, name: v.name, vin: v.vin, plate: v.plate ?? null, group: pathsFor(v.groupIds, provGroups), groups: groupNames(v.groupIds, provGroups) }));
    }
  } catch { /* the status line already carries the last error */ }
  const mappedVeh = new Set(rows.map((r) => r.provider_vehicle_id));
  // Trailers (hookup detection): linked, and who is left to match.
  const tm = await admin.from("telematics_trailer_map").select("provider_trailer_id, trailer_id").eq("company_id", companyId);
  const trows = (tm.data ?? []) as { provider_trailer_id: string; trailer_id: string }[];
  const { data: ourTr } = await admin.from("trailers").select("trailer_id, trailer_name").eq("company_id", companyId).eq("active", true);
  let provTr: { id: string; name: string; groupIds?: string[]; group?: string; groups?: string[] }[] = [];
  try { const p = await providerFor(companyId); provTr = p ? (await p.listTrailers()).map((t) => ({ ...t, group: pathsFor(t.groupIds, provGroups), groups: groupNames(t.groupIds, provGroups) })) : []; } catch { /* trailer tracking may not be on */ }
  const tUsed = new Set(trows.map((r) => r.trailer_id)), tvUsed = new Set(trows.map((r) => r.provider_trailer_id));
  // A trailer's VIN and plate live on the same-named Device in the "Trailer" group.
  const devByName = new Map<string, { vin: string | null; plate: string | null }>();
  for (const d of bestPerName(importableVehicles(rawVehicles))) {
    if (groupNames(d.groupIds, provGroups).some((n) => n.trim().toLowerCase() === "trailer")) devByName.set(d.name.trim().toLowerCase(), { vin: d.vin, plate: d.plate ?? null });
  }
  const withIds = <T extends { name: string }>(t: T) => ({ ...t, ...(devByName.get(t.name.trim().toLowerCase()) ?? {}) });
  const ourTrName = new Map(((ourTr ?? []) as { trailer_id: string; trailer_name: string }[]).map((t) => [t.trailer_id, t.trailer_name]));
  const linkedByProv = new Map(trows.map((r) => [r.provider_trailer_id, ourTrName.get(r.trailer_id) ?? null]));
  // Drivers (hours of service): linked, and who is left to match.
  const dm = await admin.from("telematics_driver_map").select("provider_user_id, user_id, driver_name, matched_by").eq("company_id", companyId);
  const drows = (dm.data ?? []) as { provider_user_id: string; user_id: string; driver_name: string | null; matched_by: string }[];
  let drivers: { id: string; name: string }[] = [];
  let members: { user_id: string; display_name: string | null }[] = [];
  try {
    const p = await providerFor(companyId);
    drivers = p ? (await p.listDrivers()).map((d) => ({ id: d.id, name: [d.firstName, d.lastName].filter(Boolean).join(" ") || d.name })) : [];
    members = (await rosterMembers(companyId)).map((m) => ({ user_id: m.user_id, display_name: m.display_name }));
  } catch { /* hours of service just shows no drivers */ }
  const groupRows = summarizeGroups(provGroups, rawVehicles, provTr).map((g) => ({
    path: g.path, truckCount: g.trucks.length, trailerCount: g.trailers.length, sample: g.trucks.slice(0, 6),
  }));
  const dUsed = new Set(drows.map((r) => r.provider_user_id)), mUsed = new Set(drows.map((r) => r.user_id));
  return {
    trailersLinked: trows.length,
    unmatchedTrailers: bestPerName(provTr).filter((t) => !tvUsed.has(t.id)).map(withIds),
    linkedTrailers: provTr.filter((t) => tvUsed.has(t.id)).map((t) => ({ ...withIds(t), linkedTo: linkedByProv.get(t.id) ?? null })),
    unmatchedOurTrailers: ((ourTr ?? []) as { trailer_id: string; trailer_name: string }[]).filter((t) => !tUsed.has(t.trailer_id)).map((t) => ({ trailerId: t.trailer_id, name: t.trailer_name })),
    groups: groupRows,
    driversLinked: drows.length,
    unmatchedDrivers: drivers.filter((d) => !dUsed.has(d.id)),
    unmatchedMembers: members.filter((m) => !mUsed.has(m.user_id)).map((m) => ({ userId: m.user_id, name: m.display_name ?? "Member" })),
    connected: true, ...conn,
    matched: rows.map((r) => ({ vehicleId: r.provider_vehicle_id, vehicleName: r.vehicle_name, truckId: r.truck_id, truckName: trucks.find((t) => t.truck_id === r.truck_id)?.truck_name ?? "?", by: r.matched_by })),
    unmatchedTrucks: trucks.filter((t) => !mapped.has(t.truck_id)).map((t) => ({ truckId: t.truck_id, truckName: t.truck_name })),
    unmatchedVehicles: vehicles.filter((v) => !mappedVeh.has(v.id)),
  };
}

export async function GET(req: NextRequest) {
  const g = await gate(req, req.nextUrl.searchParams.get("companyId"));
  if ("err" in g) return g.err;
  // Opening the settings fills in any driver that matches by employee number, email or name.
  try { await autoLinkAllDrivers(g.companyId, true); } catch { /* the list below still shows who is left */ }
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

  if (Array.isArray(body.trailerMap)) {
    for (const m of body.trailerMap as { providerTrailerId: string; name?: string; trailerId: string | null }[]) {
      if (!m.providerTrailerId) continue;
      await admin.from("telematics_trailer_map").delete().eq("company_id", g.companyId).eq("provider_trailer_id", m.providerTrailerId);
      if (m.trailerId) {
        await admin.from("telematics_trailer_map").delete().eq("company_id", g.companyId).eq("trailer_id", m.trailerId);
        const { error } = await admin.from("telematics_trailer_map").insert({ company_id: g.companyId, provider_trailer_id: m.providerTrailerId, trailer_id: m.trailerId, trailer_name: m.name ?? null, matched_by: "manual" });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json(await summary(g.companyId));
  }

  // Bring Geotab equipment in: new units are created, units we already have (same VIN or name) are
  // linked and updated per the chosen fields and mode. syncLinked re-applies that to units already linked.
  if (Array.isArray(body.importVehicles) || Array.isArray(body.importTrailers) || body.syncLinked === true) {
    const p = await providerFor(g.companyId);
    if (!p) return NextResponse.json({ error: "Geotab isn't connected." }, { status: 400 });
    const o = parseOpts(body.opts);
    const lower = (x: string) => x.trim().toLowerCase();
    const CHUNK = 150; // keeps one request inside the function time limit
    const result = { added: 0, linked: 0, updated: 0 };
    const regionsSeen = new Set<string>();
    const inBatches = async <T,>(items: T[], fn: (x: T) => Promise<void>) => { for (let i = 0; i < items.length; i += 15) await Promise.all(items.slice(i, i + 15).map(fn)); };
    try {
      const groups = await p.listGroups().catch(() => []);
      const TRUCK_COLS = "truck_id, truck_name, vin_number, plate_number, make, model, year, region";
      if (Array.isArray(body.importVehicles) || body.syncLinked === true) {
        const [vehicles, mapRes, oursRes] = await Promise.all([
          p.listVehicles(),
          admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", g.companyId),
          admin.from("trucks").select(TRUCK_COLS).eq("company_id", g.companyId),
        ]);
        const mapRows = (mapRes.data ?? []) as { provider_vehicle_id: string; truck_id: string }[];
        const mappedProv = new Set(mapRows.map((r) => r.provider_vehicle_id));
        const mappedTruck = new Set(mapRows.map((r) => r.truck_id));
        const ours = (oursRes.data ?? []) as TruckRow[];
        const byId = new Map(ours.map((t) => [t.truck_id, t]));
        const byVin = new Map(ours.filter((t) => t.vin_number).map((t) => [t.vin_number!.toUpperCase(), t]));
        const byName = new Map(ours.map((t) => [lower(t.truck_name), t]));
        const vById = new Map(vehicles.map((v) => [v.id, v]));
        const creates: typeof vehicles = [];
        const updates: { v: (typeof vehicles)[number]; truck: TruckRow; link: boolean }[] = [];
        if (body.syncLinked === true) {
          if (o.existing !== "skip") for (const r of mapRows) { const v = vById.get(r.provider_vehicle_id), t = byId.get(r.truck_id); if (v && t) updates.push({ v, truck: t, link: false }); }
        } else {
          const want = new Set((body.importVehicles as unknown[]).map(String));
          const takenNames = new Set<string>();
          for (const v of vehicles) {
            if (creates.length + updates.length >= CHUNK) break;
            if (!want.has(v.id) || mappedProv.has(v.id)) continue;
            const hit = (v.vin && byVin.get(v.vin)) || byName.get(lower(v.name));
            if (hit) {
              if (o.existing === "skip" || mappedTruck.has(hit.truck_id)) continue;
              mappedTruck.add(hit.truck_id);
              updates.push({ v, truck: hit, link: true });
            } else {
              if (takenNames.has(lower(v.name))) continue;
              takenNames.add(lower(v.name));
              creates.push(v);
            }
          }
        }
        const need = [...creates, ...updates.map((u) => u.v)];
        const info = o.fields.vehicle ? await decodeVins(need.map((v) => v.vin ?? "")) : new Map();
        const regionOf = (v: (typeof vehicles)[number]) => regionFor(groupNames(v.groupIds, groups), o);
        if (creates.length) {
          const rows = creates.map((v) => {
            const patch = truckPatch(null, { vin: v.vin, plate: v.plate ?? null }, v.vin ? info.get(v.vin) : undefined, regionOf(v), o);
            if (patch.region) regionsSeen.add(String(patch.region));
            return { company_id: g.companyId, truck_name: v.name.trim(), active: true, ...patch };
          });
          const { data, error } = await admin.from("trucks").insert(rows).select("truck_id, truck_name");
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
          const idByName = new Map(((data ?? []) as { truck_id: string; truck_name: string }[]).map((t) => [lower(t.truck_name), t.truck_id]));
          const maps = creates.flatMap((v) => { const id = idByName.get(lower(v.name)); return id ? [{ company_id: g.companyId, provider_vehicle_id: v.id, truck_id: id, vehicle_name: v.name, matched_by: "import" }] : []; });
          if (maps.length) await admin.from("telematics_vehicle_map").insert(maps);
          result.added += maps.length;
        }
        await inBatches(updates, async ({ v, truck, link }) => {
          if (link) {
            const { error } = await admin.from("telematics_vehicle_map").insert({ company_id: g.companyId, provider_vehicle_id: v.id, truck_id: truck.truck_id, vehicle_name: v.name, matched_by: "import" });
            if (!error) result.linked++;
          }
          const patch = truckPatch(truck, { vin: v.vin, plate: v.plate ?? null }, v.vin ? info.get(v.vin) : undefined, regionOf(v), o);
          if (!Object.keys(patch).length) return;
          const { error } = await admin.from("trucks").update(patch).eq("truck_id", truck.truck_id).eq("company_id", g.companyId);
          if (!error) { result.updated++; if (patch.region) regionsSeen.add(String(patch.region)); }
        });
      }
      if (Array.isArray(body.importTrailers) || body.syncLinked === true) {
        const [trailers, mapRes, oursRes, devices] = await Promise.all([
          p.listTrailers(),
          admin.from("telematics_trailer_map").select("provider_trailer_id, trailer_id").eq("company_id", g.companyId),
          admin.from("trailers").select("trailer_id, trailer_name, region, vin_number, plate_number").eq("company_id", g.companyId),
          p.listVehicles().catch(() => []),
        ]);
        // Geotab keeps a trailer's VIN and plate on the same-named Device in the "Trailer" group.
        const devByName = new Map<string, { vin: string | null; plate: string | null }>();
        for (const d of bestPerName(importableVehicles(devices))) {
          if (!groupNames(d.groupIds, groups).some((n) => n.trim().toLowerCase() === "trailer")) continue;
          devByName.set(lower(d.name), { vin: d.vin, plate: d.plate ?? null });
        }
        const want = new Set(Array.isArray(body.importTrailers) ? (body.importTrailers as unknown[]).map(String) : []);
        const mapRows = (mapRes.data ?? []) as { provider_trailer_id: string; trailer_id: string }[];
        const mappedProv = new Set(mapRows.map((r) => r.provider_trailer_id));
        const mappedTr = new Set(mapRows.map((r) => r.trailer_id));
        const ours = (oursRes.data ?? []) as { trailer_id: string; trailer_name: string; region: string | null; vin_number: string | null; plate_number: string | null }[];
        const byName = new Map(ours.map((t) => [lower(t.trailer_name), t]));
        const tById = new Map(ours.map((t) => [t.trailer_id, t]));
        const provById = new Map(trailers.map((t) => [t.id, t]));
        const creates: typeof trailers = [];
        const updates: { t: (typeof trailers)[number]; hit: (typeof ours)[number] }[] = [];
        const taken = new Set<string>();
        const idPatch = (name: string, cur: { vin_number: string | null; plate_number: string | null } | null) => {
          const dev = devByName.get(lower(name));
          const want: Record<string, string> = {};
          if (dev && o.fields.vin && dev.vin) want.vin_number = dev.vin;
          if (dev && o.fields.plate && dev.plate) want.plate_number = dev.plate;
          if (!cur) return want;
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(want)) {
            const c = (cur as any)[k];
            if (o.existing === "overwrite" ? String(c ?? "") !== v : c == null || String(c).trim() === "") out[k] = v;
          }
          return out;
        };
        if (body.syncLinked === true) {
          if (o.existing !== "skip") for (const r of mapRows) { const t = provById.get(r.provider_trailer_id), hit = tById.get(r.trailer_id); if (t && hit) updates.push({ t, hit }); }
        } else
        for (const t of bestPerName(trailers)) {
          if (creates.length + updates.length >= CHUNK) break;
          if (!want.has(t.id) || mappedProv.has(t.id)) continue;
          const hit = byName.get(lower(t.name));
          if (hit) {
            if (o.existing === "skip" || mappedTr.has(hit.trailer_id)) continue;
            mappedTr.add(hit.trailer_id);
            updates.push({ t, hit });
          } else if (!taken.has(lower(t.name))) { taken.add(lower(t.name)); creates.push(t); }
        }
        const regionOf = (t: (typeof trailers)[number]) => regionFor(groupNames(t.groupIds, groups), o);
        if (creates.length) {
          const rows = creates.map((t) => { const r = regionOf(t); if (r) regionsSeen.add(r); return { company_id: g.companyId, trailer_name: t.name.trim(), active: true, ...(r ? { region: r } : {}), ...idPatch(t.name, null) }; });
          const { data, error } = await admin.from("trailers").insert(rows).select("trailer_id, trailer_name");
          if (error) return NextResponse.json({ error: error.message }, { status: 400 });
          const idByName = new Map(((data ?? []) as { trailer_id: string; trailer_name: string }[]).map((t) => [lower(t.trailer_name), t.trailer_id]));
          const maps = creates.flatMap((t) => { const id = idByName.get(lower(t.name)); return id ? [{ company_id: g.companyId, provider_trailer_id: t.id, trailer_id: id, trailer_name: t.name, matched_by: "import" }] : []; });
          if (maps.length) await admin.from("telematics_trailer_map").insert(maps);
          result.added += maps.length;
        }
        await inBatches(updates, async ({ t, hit }) => {
          if (body.syncLinked !== true) {
          const { error } = await admin.from("telematics_trailer_map").insert({ company_id: g.companyId, provider_trailer_id: t.id, trailer_id: hit.trailer_id, trailer_name: t.name, matched_by: "import" });
          if (!error) result.linked++;
          }
          const r = regionOf(t);
          const patch: Record<string, unknown> = idPatch(t.name, hit);
          if (r && (o.existing === "overwrite" ? hit.region !== r : !hit.region)) patch.region = r;
          if (Object.keys(patch).length) {
            const { error: e2 } = await admin.from("trailers").update(patch).eq("trailer_id", hit.trailer_id).eq("company_id", g.companyId);
            if (!e2) { result.updated++; if (patch.region) regionsSeen.add(String(patch.region)); }
          }
        });
      }
      // Region names used above become real Region entries so the pickers offer them.
      if (regionsSeen.size) {
        const { data } = await admin.from("equipment_regions").select("name").eq("company_id", g.companyId);
        const have = new Set(((data ?? []) as { name: string }[]).map((r) => lower(r.name)));
        const add = [...regionsSeen].filter((n) => !have.has(lower(n))).map((name) => ({ company_id: g.companyId, name }));
        if (add.length) await admin.from("equipment_regions").insert(add);
      }
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
    return NextResponse.json({ ...(await summary(g.companyId)), result });
  }

  if (Array.isArray(body.driverMap)) {
    for (const m of body.driverMap as { driverId: string; driverName?: string; userId: string | null }[]) {
      if (!m.driverId) continue;
      await admin.from("telematics_driver_map").delete().eq("company_id", g.companyId).eq("provider_user_id", m.driverId);
      if (m.userId) {
        await admin.from("telematics_driver_map").delete().eq("company_id", g.companyId).eq("user_id", m.userId);
        const { error } = await admin.from("telematics_driver_map").insert({ company_id: g.companyId, provider_user_id: m.driverId, user_id: m.userId, driver_name: m.driverName ?? null, matched_by: "manual" });
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
    try {
      const prov = geotabProvider({ database, userName, password });
      const { data: ours } = await admin.from("trailers").select("trailer_id, trailer_name, vin_number").eq("company_id", g.companyId).eq("active", true);
      const res = matchVehicles((await prov.listTrailers()).map((t) => ({ id: t.id, name: t.name, vin: null })),
        ((ours ?? []) as { trailer_id: string; trailer_name: string }[]).map((t) => ({ truck_id: t.trailer_id, truck_name: t.trailer_name, vin_number: null })));
      await admin.from("telematics_trailer_map").delete().eq("company_id", g.companyId).neq("matched_by", "manual");
      for (const p of res.pairs) {
        await admin.from("telematics_trailer_map").upsert({ company_id: g.companyId, provider_trailer_id: p.vehicle.id, trailer_id: p.truck.truck_id, trailer_name: p.vehicle.name, matched_by: p.by }, { onConflict: "company_id,provider_trailer_id", ignoreDuplicates: true });
      }
    } catch { /* no trailer tracking: hookup detection simply stays off */ }
    try {
      const drv = await geotabProvider({ database, userName, password }).listDrivers();
      const dres = matchDrivers(drv, await rosterMembers(g.companyId));
      await admin.from("telematics_driver_map").delete().eq("company_id", g.companyId).neq("matched_by", "manual");
      for (const p of dres.pairs) {
        await admin.from("telematics_driver_map").upsert({ company_id: g.companyId, provider_user_id: p.driver.id, user_id: p.member.user_id, driver_name: p.driver.name, matched_by: p.by }, { onConflict: "company_id,provider_user_id", ignoreDuplicates: true });
      }
    } catch { /* vehicles are linked; drivers can be matched by hand */ }
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
  await admin.from("telematics_driver_map").delete().eq("company_id", g.companyId);
  await admin.from("telematics_trailer_map").delete().eq("company_id", g.companyId);
  await admin.from("telematics_connections").delete().eq("company_id", g.companyId);
  return NextResponse.json({ connected: false });
}
