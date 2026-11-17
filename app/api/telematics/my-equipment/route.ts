// app/api/telematics/my-equipment/route.ts
//
// GET -> what Geotab says about the CALLER right now: the truck they are signed in to (as the driver or in the second
// seat), the trailer hooked to it, and what ProTankr has on file for those units (status, notes, who deadlined it,
// who holds it). The dashboard compares this with what the driver has selected and offers to match it. Read only.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { callerId, providerFor } from "@/lib/telematics/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Unit = { id: string; name: string; status: string | null; notes: string | null; subStatus: string | null; statusAt: string | null; location: string | null;
  deadlinedBy: string | null; resume: { notes: string | null; deadlinedAt: string | null; deadlinedBy: string | null } | null };

export async function GET(req: NextRequest) {
  const uid = await callerId(req);
  if (!uid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const admin = getServiceSupabase();
    const { data: us } = await admin.from("user_settings").select("active_company_id").eq("user_id", uid).maybeSingle();
    const companyId = (us as { active_company_id?: string } | null)?.active_company_id;
    if (!companyId) return NextResponse.json({ linked: false });
    const { data: dm } = await admin.from("telematics_driver_map").select("provider_user_id").eq("company_id", companyId).eq("user_id", uid).maybeSingle();
    const me = (dm as { provider_user_id?: string } | null)?.provider_user_id;
    if (!me) return NextResponse.json({ linked: false });
    const p = await providerFor(companyId);
    if (!p) return NextResponse.json({ linked: false });

    // The vehicle I'm the main driver of; else one where I'm in the second seat.
    const current = await p.currentDrivers();
    let vehicleId: string | null = null, role: "driver" | "second" = "driver", driverProviderId: string | null = null;
    for (const [veh, drv] of current) if (drv === me) { vehicleId = veh; break; }
    if (!vehicleId) {
      for (const [veh, drv] of current) {
        const co = await p.coDriversOf(veh).catch(() => [] as string[]);
        if (co.includes(me)) { vehicleId = veh; role = "second"; driverProviderId = drv; break; }
      }
    }
    if (!vehicleId) return NextResponse.json({ linked: true, signedIn: false });

    const { data: vm } = await admin.from("telematics_vehicle_map").select("truck_id, vehicle_name").eq("company_id", companyId).eq("provider_vehicle_id", vehicleId).maybeSingle();
    const truckId = (vm as { truck_id?: string } | null)?.truck_id ?? null;
    if (!truckId) return NextResponse.json({ linked: true, signedIn: true, role, vehicleName: (vm as any)?.vehicle_name ?? null, truck: null });

    const attachedAll = await p.attachedAll().catch(() => new Map<string, string[]>());
    const trailerKnown = attachedAll.size > 0;
    const provTrailers = attachedAll.get(vehicleId) ?? [];
    const { data: tm } = provTrailers.length ? await admin.from("telematics_trailer_map").select("provider_trailer_id, trailer_id").eq("company_id", companyId).in("provider_trailer_id", provTrailers) : { data: [] as any[] };
    const trailerIds = ((tm ?? []) as { trailer_id: string }[]).map((r) => r.trailer_id);

    const unitOf = async (kind: "truck" | "trailer", id: string): Promise<Unit | null> => {
      const t = kind === "truck" ? "trucks" : "trailers";
      const { data } = await admin.from(t).select(`${kind}_id, ${kind}_name, status_code, status_notes, sub_status, status_updated_at, status_location`).eq(`${kind}_id`, id).maybeSingle();
      const r = data as any;
      if (!r) return null;
      const [{ data: park }, { data: res }] = await Promise.all([
        admin.from("equipment_parks").select("parked_by").eq("unit_kind", kind).eq("unit_id", id).maybeSingle(),
        admin.from("equipment_deadline_resume").select("notes, deadlined_at, deadlined_by_name").eq("unit_kind", kind).eq("unit_id", id).maybeSingle(),
      ]);
      let by: string | null = null;
      const pb = (park as { parked_by?: string } | null)?.parked_by;
      if (pb) { const { data: pr } = await admin.from("profiles").select("display_name").eq("user_id", pb).maybeSingle(); by = (pr as any)?.display_name ?? null; }
      const rs = res as any;
      return {
        id, name: r[`${kind}_name`], status: r.status_code ?? null, notes: r.status_notes ?? null, subStatus: r.sub_status ?? null, statusAt: r.status_updated_at ?? null, location: r.status_location ?? null,
        deadlinedBy: rs?.deadlined_by_name ?? by, resume: rs ? { notes: rs.notes ?? null, deadlinedAt: rs.deadlined_at ?? null, deadlinedBy: rs.deadlined_by_name ?? null } : null,
      };
    };
    const truck = await unitOf("truck", truckId);
    const trailers = (await Promise.all(trailerIds.map((id) => unitOf("trailer", id)))).filter((x): x is Unit => !!x);

    // Who holds the truck in ProTankr, and who Geotab says is behind the wheel (when that is someone else).
    const { data: held } = await admin.from("user_settings").select("user_id").eq("current_truck_id", truckId).limit(1);
    const holderId = ((held ?? []) as { user_id: string }[])[0]?.user_id ?? null;
    const names = async (ids: string[]) => {
      if (!ids.length) return new Map<string, string>();
      const { data } = await admin.from("profiles").select("user_id, display_name").in("user_id", ids);
      return new Map(((data ?? []) as any[]).map((r) => [r.user_id as string, r.display_name as string]));
    };
    let driverUserId: string | null = null;
    if (driverProviderId) { const { data } = await admin.from("telematics_driver_map").select("user_id").eq("company_id", companyId).eq("provider_user_id", driverProviderId).maybeSingle(); driverUserId = (data as any)?.user_id ?? null; }
    const nm = await names([holderId, driverUserId].filter((x): x is string => !!x));
    return NextResponse.json({
      linked: true, signedIn: true, role, truck, trailers, trailerKnown,
      holder: holderId && holderId !== uid ? { id: holderId, name: nm.get(holderId) ?? null } : null,
      driver: driverUserId ? { id: driverUserId, name: nm.get(driverUserId) ?? null } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message ?? e).slice(0, 200) }, { status: 502 });
  }
}
