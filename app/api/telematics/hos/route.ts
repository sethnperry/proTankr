// app/api/telematics/hos/route.ts
//
// GET ?companyId= -> { connected, hos: { [userId]: { driveLeftMin, dutyLeftMin, cycleLeftMin, status, at } } }
// What every linked driver has left on the clock. Staff only; cached two
// minutes per company so a busy board doesn't hammer the provider. Soft fail.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, companyRole, providerFor } from "@/lib/telematics/server";
import type { HosAvailability } from "@/lib/telematics/types";

export const runtime = "nodejs";

const STAFF = new Set(["admin", "owner", "dispatch", "lead"]);
const TTL_MS = 120_000;
const cache = new Map<string, { at: number; hos: Record<string, HosAvailability> }>();

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  const r = await companyRole(uid, companyId);
  if (!r.superAdmin && !(r.role && STAFF.has(r.role))) return NextResponse.json({ error: "Staff only." }, { status: 403 });
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ connected: true, hos: hit.hos });
  try {
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ connected: false });
    const { data } = await getServiceSupabase().from("telematics_driver_map").select("provider_user_id, user_id").eq("company_id", companyId);
    const rows = (data ?? []) as { provider_user_id: string; user_id: string }[];
    const hos: Record<string, HosAvailability> = {};
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(rows.slice(i, i + 4).map(async (m) => {
        try { const h = await p.hos(m.provider_user_id); if (h) hos[m.user_id] = h; } catch { /* that driver shows no hours */ }
      }));
    }
    cache.set(companyId, { at: Date.now(), hos });
    return NextResponse.json({ connected: true, hos });
  } catch (e) {
    console.warn("[telematics] hos failed:", (e as Error).message);
    return NextResponse.json({ connected: false });
  }
}
