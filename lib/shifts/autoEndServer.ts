// lib/shifts/autoEndServer.ts
//
// Server side of autoEnd.ts, run on the five-minute tick. For every driver with an open shift whose tracker shows
// them OFF duty for 15 minutes: end the shift at that time (source geotab, marked auto), park a load still aboard,
// park the truck where it stopped as Readyline, and tell the driver. The app opens the end-of-shift catch-up the
// next time it runs. Service client; never import from the browser.

import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { driverOwnProviders, hosOwnFirst, providerFor } from "@/lib/telematics/server";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { deriveShifts, openShift } from "./shiftLogic";
import { autoEndAt } from "./autoEnd";
import { nearestPlace } from "./catchUp";
import type { ShiftEventRow } from "@/lib/trips/types";

const OPEN = ["draft", "loading", "in_transit", "delivering"];

export async function runAutoEndShifts(): Promise<number> {
  const admin = getServiceSupabase();
  const { data } = await admin.from("telematics_connections").select("company_id").eq("status", "active");
  let closed = 0;
  for (const c of (data ?? []) as { company_id: string }[]) {
    try { closed += await runCompany(c.company_id); } catch (e) { console.warn("[auto-end] company failed:", (e as Error).message); }
  }
  return closed;
}

async function runCompany(companyId: string): Promise<number> {
  const admin = getServiceSupabase();
  const nowMs = Date.now(), nowIso = new Date(nowMs).toISOString();
  const { data: ev } = await admin.from("shift_events").select("*").eq("company_id", companyId).gte("occurred_at", new Date(nowMs - 3 * 86400_000).toISOString()).order("occurred_at").limit(5000);
  const events = (ev ?? []) as ShiftEventRow[];
  const users = [...new Set(events.map((e) => e.user_id))];
  const open: { userId: string; startedAt: string }[] = [];
  for (const u of users) { const s = openShift(deriveShifts(events, u, nowIso)); if (s) open.push({ userId: u, startedAt: s.startedAt }); }
  if (!open.length) return 0;

  const p = await providerFor(companyId);
  if (!p) return 0;
  const ids = open.map((o) => o.userId);
  const [dm, vm, settings, locs] = await Promise.all([
    admin.from("telematics_driver_map").select("provider_user_id, user_id").eq("company_id", companyId).in("user_id", ids),
    admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId),
    admin.from("user_settings").select("user_id, current_truck_id, current_trailer_id").in("user_id", ids),
    admin.from("delivery_locations").select("location_id, name, lat, lon, place_kinds").eq("company_id", companyId),
  ]);
  const provUser = new Map(((dm.data ?? []) as any[]).map((r) => [r.user_id as string, r.provider_user_id as string]));
  const vehOf = new Map(((vm.data ?? []) as any[]).map((r) => [r.truck_id as string, r.provider_vehicle_id as string]));
  const held = new Map(((settings.data ?? []) as any[]).map((r) => [r.user_id as string, r]));
  const places = ((locs.data ?? []) as any[]).map((l) => ({ id: String(l.location_id), name: String(l.name), lat: l.lat != null ? Number(l.lat) : null, lon: l.lon != null ? Number(l.lon) : null, kinds: (l.place_kinds ?? []) as string[] }));
  const own = await driverOwnProviders(companyId, ids.filter((u) => provUser.has(u)));

  let closed = 0;
  for (const o of open) {
    const pu = provUser.get(o.userId);
    if (!pu) continue;
    let hos = null;
    try { hos = await hosOwnFirst(p, own, o.userId, pu); } catch { continue; }
    const at = autoEndAt({ openStartedAt: o.startedAt, hos, nowMs });
    if (!at) continue;
    try { if (await closeShift(companyId, o.userId, o.startedAt, at, held.get(o.userId), vehOf, places, p)) closed++; }
    catch (e) { console.warn("[auto-end] close failed:", (e as Error).message); }
  }
  return closed;
}

async function closeShift(companyId: string, userId: string, startedAt: string, at: string, st: any, vehOf: Map<string, string>, places: ReturnType<typeof Array.prototype.map> & any[], p: NonNullable<Awaited<ReturnType<typeof providerFor>>>): Promise<boolean> {
  const admin = getServiceSupabase();
  // The driver's open trip, if any, tells which truck and trailer they had.
  const { data: tr } = await admin.from("trips").select("trip_id, status, truck_id, trailer_id, trip_compartment_loads(disposition)").eq("driver_id", userId).in("status", OPEN).order("started_at", { ascending: false }).limit(1);
  const trip = ((tr ?? []) as any[])[0] ?? null;
  const truckId: string | null = st?.current_truck_id ?? trip?.truck_id ?? null;
  const trailerId: string | null = st?.current_trailer_id ?? trip?.trailer_id ?? null;
  const vid = truckId ? vehOf.get(truckId) : undefined;
  let lat: number | null = null, lon: number | null = null, odo: number | null = null;
  if (vid) {
    const r = await p.reading(vid, { slim: true }).catch(() => null);
    lat = r?.lat ?? null; lon = r?.lon ?? null; odo = r?.odometerMi != null ? Math.round(r.odometerMi) : null;
  }
  const place = nearestPlace(lat, lon, places as any);
  const label = place?.name ?? null;

  // The shift ends first: it is the claim, so a repeated tick finds it closed and does nothing more.
  const ins = await admin.from("shift_events").insert({
    event_id: randomUUID(), company_id: companyId, user_id: userId, event_type: "shift_end", occurred_at: at, actor_id: userId, source: "geotab",
    payload: { auto: true, auto_reason: "off_duty_15", truck_id: truckId, trailer_id: trailerId, lat, lon, odometer: odo, place_id: place?.id ?? null, place_text: label, location_source: "geotab", odometer_source: "truck" },
  });
  if (ins.error) return false;

  // A load still aboard is parked where the truck stopped.
  const aboard = ((trip?.trip_compartment_loads ?? []) as any[]).some((c) => c.disposition === "loaded");
  if (trip && aboard) {
    const now = new Date().toISOString();
    await admin.from("trips").update({ status: "parked", parked_at: at, parked_by: userId, parked_for: "layover", parked_where: label, parked_note: "Parked automatically when the shift ended.", client_updated_at: now }).eq("trip_id", trip.trip_id).in("status", OPEN);
    await admin.from("trip_events").insert({ event_id: randomUUID(), trip_id: trip.trip_id, event_type: "parked", occurred_at: at, actor_id: userId, payload: { auto: true, parked_for: "layover", where: label, from_status: trip.status } });
  }
  // An empty move still running ends here.
  await admin.from("empty_moves").update({ ended_at: at, end_miles: odo, client_updated_at: new Date().toISOString() }).eq("driver_id", userId).is("ended_at", null);

  // The truck: Readyline / Parked unless its status was already set during this shift.
  let setStatus = true;
  if (truckId) {
    const { data: t } = await admin.from("trucks").select("status_updated_at").eq("truck_id", truckId).maybeSingle();
    const su = (t as { status_updated_at?: string | null } | null)?.status_updated_at;
    if (su && Date.parse(su) >= Date.parse(startedAt)) setStatus = false;
  }
  if (truckId || trailerId) {
    const rr = await admin.rpc("auto_park_equipment", { p_user_id: userId, p_truck_id: truckId, p_trailer_id: trailerId, p_lat: lat, p_lon: lon, p_label: label, p_place_id: place?.id ?? null, p_set_status: setStatus, p_notes: "Shift ended automatically" });
    if (rr.error) console.warn("[auto-end] park failed:", rr.error.message);
  }

  // Tell the driver. They open the app to confirm what the truck did.
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("company_id", companyId).eq("user_id", userId);
  const when = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.REPORT_TZ || "America/New_York" });
  await sendPush((subs ?? []) as StoredSub[], { title: "Your shift was ended", body: `We ended your shift at ${when}${label ? ` at ${label}` : ""}. Open the app to confirm your day.`, url: "/planner/home", tag: `auto-end-${userId}` });
  return true;
}
