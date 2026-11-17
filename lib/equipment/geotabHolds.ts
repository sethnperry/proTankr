// lib/equipment/geotabHolds.ts
//
// Server side, run on the five-minute tick. When the tracker shows a driver signed in to a truck, and ProTankr has
// that driver holding something else (they never opened the app), the pair is held for them, so the equipment
// board shows who has it. The trailer is recorded as a handoff: nobody has said what it holds. When the driver
// signs out for a while the pair is released. Service client; never import from the browser.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { providerFor } from "@/lib/telematics/server";

const RELEASE_AFTER_MS = 20 * 60_000;

export async function runGeotabHolds(): Promise<number> {
  const admin = getServiceSupabase();
  const { data } = await admin.from("telematics_connections").select("company_id").eq("status", "active");
  let n = 0;
  for (const c of (data ?? []) as { company_id: string }[]) {
    try { n += await runCompany(c.company_id); } catch (e) { console.warn("[geotab-holds] company failed:", (e as Error).message); }
  }
  return n;
}

async function runCompany(companyId: string): Promise<number> {
  const admin = getServiceSupabase();
  const p = await providerFor(companyId);
  if (!p) return 0;
  const nowMs = Date.now(), nowIso = new Date(nowMs).toISOString();
  const current = await p.currentDrivers().catch(() => new Map<string, string>());
  if (current.size === 0) return 0; // no answer: change nothing
  const attached = await p.attachedAll().catch(() => new Map<string, string[]>());
  const trailerKnown = attached.size > 0;

  const [vm, dm, tm, hs, open] = await Promise.all([
    admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId),
    admin.from("telematics_driver_map").select("provider_user_id, user_id").eq("company_id", companyId),
    admin.from("telematics_trailer_map").select("provider_trailer_id, trailer_id").eq("company_id", companyId),
    admin.from("equipment_handoffs").select("*").eq("company_id", companyId).is("ended_at", null),
    Promise.resolve(null),
  ]);
  void open;
  const truckOfVeh = new Map(((vm.data ?? []) as any[]).map((r) => [r.provider_vehicle_id as string, r.truck_id as string]));
  const vehOfTruck = new Map(((vm.data ?? []) as any[]).map((r) => [r.truck_id as string, r.provider_vehicle_id as string]));
  const userOfProv = new Map(((dm.data ?? []) as any[]).map((r) => [r.provider_user_id as string, r.user_id as string]));
  const trailerOfProv = new Map(((tm.data ?? []) as any[]).map((r) => [r.provider_trailer_id as string, r.trailer_id as string]));
  const handoffs = (hs.data ?? []) as { handoff_id: string; user_id: string; truck_id: string | null; trailer_id: string | null; last_seen_at: string }[];

  const driverUserIds = [...new Set([...current.values()].map((d) => userOfProv.get(d)).filter((x): x is string => !!x))];
  const { data: us } = driverUserIds.length ? await admin.from("user_settings").select("user_id, current_truck_id, current_trailer_id").in("user_id", driverUserIds) : { data: [] as any[] };
  const heldBy = new Map(((us ?? []) as any[]).map((r) => [r.user_id as string, r as { current_truck_id: string | null; current_trailer_id: string | null }]));

  let changed = 0;
  const seen = new Set<string>(); // handoffs whose driver is still in the truck
  for (const [veh, drvProv] of current) {
    const truckId = truckOfVeh.get(veh), userId = userOfProv.get(drvProv);
    if (!truckId || !userId) continue;
    const prov = trailerKnown ? (attached.get(veh) ?? []) : [];
    const trailerId = prov.map((t) => trailerOfProv.get(t)).find((x): x is string => !!x) ?? null;
    const mine = heldBy.get(userId);
    const holdsTruck = mine?.current_truck_id === truckId;
    const holdsTrailer = !trailerId || mine?.current_trailer_id === trailerId;
    const existing = handoffs.find((h) => h.user_id === userId && h.truck_id === truckId);
    // Signed in but off duty (ended their shift and left the tracker logged in) is not driving: never hold for that.
    const needsHos = !!existing || !(holdsTruck && holdsTrailer);
    const hos = needsHos ? await p.hos(drvProv).catch(() => null) : null;
    const working = hos?.status === "D" || hos?.status === "ON";
    if (existing && working) { seen.add(existing.handoff_id); await admin.from("equipment_handoffs").update({ last_seen_at: nowIso }).eq("handoff_id", existing.handoff_id); }
    if (holdsTruck && holdsTrailer) continue;
    if (!working) continue;
    if (!trailerKnown) continue; // can't tell what is hooked: don't split or make a pair
    try {
      if (trailerId) {
        // The pair's own last tare; failing that the same truck's or the same trailer's last, copied and flagged.
        const lastTare = async (col: "truck_id" | "trailer_id", id: string, both?: string) => {
          let q = admin.from("equipment_combos").select("tare_lbs, target_weight").eq(col, id);
          if (both) q = q.eq("trailer_id", both);
          const { data } = await q.order("claimed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
          return data as { tare_lbs?: number | null; target_weight?: number | null } | null;
        };
        let prior = await lastTare("truck_id", truckId, trailerId);
        let copied: string | null = null;
        if (prior?.tare_lbs == null) { prior = await lastTare("truck_id", truckId); if (prior?.tare_lbs != null) copied = "the truck's last pairing"; }
        if (prior?.tare_lbs == null) { prior = await lastTare("trailer_id", trailerId); if (prior?.tare_lbs != null) copied = "the trailer's last pairing"; }
        const tare = prior?.tare_lbs;
        if (tare == null) {
          // No tare anywhere for these units: no combo can be made. Say so on the handoff; the driver sets the tare when they open the app.
          if (!existing) await admin.from("equipment_handoffs").insert({ company_id: companyId, user_id: userId, truck_id: truckId, trailer_id: trailerId, note: "No tare on file for this truck or trailer. It was not coupled." });
          continue;
        }
        const r = await admin.rpc("couple_combo", { p_truck_id: truckId, p_trailer_id: trailerId, p_user_id: userId, p_tare_lbs: tare, p_target_weight: prior?.target_weight ?? null, p_buffer_lbs: null, p_force: true });
        if (r.error) { console.warn("[geotab-holds] couple failed:", r.error.message); continue; }
        if (!existing) await admin.from("equipment_handoffs").insert({ company_id: companyId, user_id: userId, truck_id: truckId, trailer_id: trailerId, note: copied ? `Tare copied from ${copied}. Confirm it with a scale ticket.` : null });
        changed++;
      } else {
        const r = await admin.rpc("set_current_equipment", { p_truck_id: truckId, p_trailer_id: null, p_user_id: userId });
        if (r.error) console.warn("[geotab-holds] bobtail hold failed:", r.error.message); else changed++;
      }
    } catch (e) { console.warn("[geotab-holds] hold failed:", (e as Error).message); }
  }

  // A driver the tracker no longer shows in the truck: after a while the pair is released where it stopped.
  const positions = await p.positions().catch(() => new Map());
  for (const h of handoffs) {
    if (seen.has(h.handoff_id) || !h.truck_id) continue;
    if (nowMs - Date.parse(h.last_seen_at) < RELEASE_AFTER_MS) continue;
    const veh = vehOfTruck.get(h.truck_id);
    const pos = veh ? (positions.get(veh) as { lat?: number; lon?: number } | undefined) : undefined;
    // Still the same driver's pair in ProTankr? If someone else took it since, there is nothing to release.
    const mine = heldBy.get(h.user_id) ?? (await admin.from("user_settings").select("current_truck_id, current_trailer_id").eq("user_id", h.user_id).maybeSingle()).data as any;
    if (mine?.current_truck_id === h.truck_id) {
      const rr = await admin.rpc("auto_park_equipment", { p_user_id: h.user_id, p_truck_id: h.truck_id, p_trailer_id: h.trailer_id, p_lat: pos?.lat ?? null, p_lon: pos?.lon ?? null, p_label: null, p_place_id: null, p_set_status: true, p_notes: "Driver signed out of the truck (tracker)" });
      if (rr.error) console.warn("[geotab-holds] release failed:", rr.error.message);
    }
    await admin.from("equipment_handoffs").update({ ended_at: nowIso }).eq("handoff_id", h.handoff_id);
    changed++;
  }
  return changed;
}
