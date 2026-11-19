// app/api/telematics/find-unit/route.ts
//
// GET ?companyId=&q=<unit number> -> the matching trucks and trailers in the company's telematics (Geotab), each with
// the fields an import would bring over and whether ProTankr already has the unit (so the button reads Import or
// Update). Company admins only. The vehicle list is cached by the provider layer, so this is cheap to repeat.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { groupNames } from "@/lib/telematics/groups";
import { bestPerName, importableVehicles } from "@/lib/telematics/dedupe";
import { decodeVins } from "@/lib/telematics/vinDecode";
import { callerId, companyRole, isCompanyAdmin } from "@/lib/auth/server";
import { providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export type FoundUnit = {
  key: string; kind: "truck" | "trailer"; providerId: string; name: string;
  vin: string | null; plate: string | null; year: number | null; make: string | null; model: string | null;
  groups: string[]; existing: { id: string; name: string } | null;
};

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  if (!isCompanyAdmin(await companyRole(uid, companyId))) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ connected: true, units: [] });
  try {
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false, units: [] });
    const [rawVehicles, groups, provTrailers] = await Promise.all([p.listVehicles(), p.listGroups().catch(() => []), p.listTrailers().catch(() => [])]);
    const devices = bestPerName(importableVehicles(rawVehicles));
    const isTrailerDevice = (ids?: string[]) => groupNames(ids, groups).some((n) => n.trim().toLowerCase() === "trailer");
    const trailerDevice = new Map(devices.filter((d) => isTrailerDevice(d.groupIds)).map((d) => [d.name.trim().toLowerCase(), d]));
    const score = (name: string) => (name.toLowerCase() === q ? 0 : name.toLowerCase().startsWith(q) ? 1 : 2);
    const trucks = devices.filter((d) => !isTrailerDevice(d.groupIds) && d.name.toLowerCase().includes(q));
    const trailers = bestPerName(provTrailers).filter((t) => t.name.toLowerCase().includes(q));
    const picked = [
      ...trucks.map((d) => ({ kind: "truck" as const, id: d.id, name: d.name, vin: d.vin, plate: d.plate ?? null, groupIds: d.groupIds })),
      ...trailers.map((t) => { const dev = trailerDevice.get(t.name.trim().toLowerCase()); return { kind: "trailer" as const, id: t.id, name: t.name, vin: dev?.vin ?? null, plate: dev?.plate ?? null, groupIds: t.groupIds?.length ? t.groupIds : dev?.groupIds }; }),
    ].sort((a, b) => score(a.name) - score(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, 12);

    const admin = getServiceSupabase();
    const [ourTrucks, ourTrailers, info] = await Promise.all([
      admin.from("trucks").select("truck_id, truck_name, vin_number").eq("company_id", companyId),
      admin.from("trailers").select("trailer_id, trailer_name, vin_number").eq("company_id", companyId),
      decodeVins(picked.map((u) => u.vin ?? "").filter(Boolean)),
    ]);
    const tr = (ourTrucks.data ?? []) as { truck_id: string; truck_name: string; vin_number: string | null }[];
    const tl = (ourTrailers.data ?? []) as { trailer_id: string; trailer_name: string; vin_number: string | null }[];
    const units: FoundUnit[] = picked.map((u) => {
      const lower = u.name.trim().toLowerCase(), vin = (u.vin ?? "").toUpperCase();
      const hit = u.kind === "truck"
        ? tr.find((t) => (vin && (t.vin_number ?? "").toUpperCase() === vin) || t.truck_name.trim().toLowerCase() === lower)
        : tl.find((t) => (vin && (t.vin_number ?? "").toUpperCase() === vin) || t.trailer_name.trim().toLowerCase() === lower);
      const v = u.vin ? info.get(u.vin) ?? info.get(u.vin.toUpperCase()) : undefined;
      return {
        key: `${u.kind}:${u.id}`, kind: u.kind, providerId: u.id, name: u.name, vin: u.vin, plate: u.plate,
        year: v?.year ?? null, make: v?.make ?? null, model: v?.model ?? null,
        groups: groupNames(u.groupIds, groups).filter((n) => n && n !== "Whole company"),
        existing: hit ? { id: "truck_id" in hit ? hit.truck_id : hit.trailer_id, name: "truck_name" in hit ? hit.truck_name : hit.trailer_name } : null,
      };
    });
    return NextResponse.json({ connected: true, provider: "Geotab", units });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e).slice(0, 200) }, { status: 502 });
  }
}
