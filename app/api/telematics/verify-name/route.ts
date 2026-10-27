// app/api/telematics/verify-name/route.ts
//
// GET ?companyId=&name= -> { connected, verified, geotabName, close }
// Is this name a driver in the company's Geotab? `verified` = first + last spelled the same as a Geotab
// driver; `close` = Geotab drivers whose name nearly matches (a typo, a nickname). Staff of the company
// only (it is used while inviting). Fails soft like the other telematics routes.

import { NextRequest, NextResponse } from "next/server";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";
import { closeNames, normName } from "@/lib/telematics/nameMatch";
import type { ProviderDriver } from "@/lib/telematics/types";

export const runtime = "nodejs";

// The fleet's driver list is the same for every keystroke: keep it for a minute.
const cache = new Map<string, { at: number; drivers: ProviderDriver[] }>();
const STAFF = new Set(["admin", "owner", "dispatch", "lead"]);

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.superAdmin && !(r.role && STAFF.has(r.role))) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (name.length < 3) return NextResponse.json({ connected: true, verified: false, geotabName: null, close: [] });
  try {
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    let hit = cache.get(companyId);
    if (!hit || Date.now() - hit.at > 60_000) {
      hit = { at: Date.now(), drivers: await p.listDrivers() };
      cache.set(companyId, hit);
    }
    const full = (d: ProviderDriver) => `${d.firstName ?? ""} ${d.lastName ?? ""}`.trim() || d.name;
    const exact = hit.drivers.find((d) => normName(full(d)) === normName(name));
    if (exact) return NextResponse.json({ connected: true, verified: true, geotabName: full(exact), close: [] });
    return NextResponse.json({ connected: true, verified: false, geotabName: null, close: closeNames(name, hit.drivers.map(full)).slice(0, 3) });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
