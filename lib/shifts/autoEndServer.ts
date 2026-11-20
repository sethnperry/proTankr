// lib/shifts/autoEndServer.ts
//
// Server side of wrapUp.ts, run on the five-minute tick, for every company (no tracker needed). A driver with an open
// shift and nothing going on for 30 minutes after their last load (3 hours with a trip still open) gets "Are you still
// working?" as a push (the app shows the same question on screen). No answer for 15 minutes ends the shift at the
// moment of the last activity: a load still aboard is parked preloaded where the truck stopped, empty equipment goes to
// Readyline with no driver linked. A running empty move is different: the server never closes it (it can't know when the
// driver stopped or the miles). After 2 quiet hours it asks, and with no answer it only flags the shift "needs
// confirmation" (shift_needs_confirm); the driver confirms the move's end, odometer and the shift's end when they next
// open the app. Geotab, when connected and switched on, only helps here: a driver it shows driving is never asked.
// Service client; never import from the browser.

import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { deriveShifts, openShift, SHIFT_END } from "./shiftLogic";
import { wrapUp } from "./wrapUp";
import { driverOwnProviders, hosOwnFirst, providerFor } from "@/lib/telematics/server";
import { nearestPlace } from "./catchUp";
import type { ShiftEventRow } from "@/lib/trips/types";
import { isOpenDelivery } from "@/lib/trips/staleDelivery";

export const SHIFT_IDLE_ASK = "shift_idle_ask";
export const SHIFT_NEEDS_CONFIRM = "shift_needs_confirm";
const OPEN = ["draft", "loading", "in_transit", "delivering"];
const DAYS = 3;

export async function runAutoEndShifts(): Promise<{ asked: number; ended: number; flagged: number }> {
  const admin = getServiceSupabase();
  const nowMs = Date.now(), nowIso = new Date(nowMs).toISOString();
  const since = new Date(nowMs - DAYS * 86400_000).toISOString();
  const { data: ev } = await admin.from("shift_events").select("*").gte("occurred_at", since).order("occurred_at").limit(20000);
  const all = (ev ?? []) as ShiftEventRow[];
  const byUser = new Map<string, ShiftEventRow[]>();
  for (const e of all) { const l = byUser.get(e.user_id) ?? []; l.push(e); byUser.set(e.user_id, l); }
  const open: { userId: string; companyId: string; startedAt: string; events: ShiftEventRow[] }[] = [];
  for (const [userId, events] of byUser) {
    const s = openShift(deriveShifts(events, userId, nowIso));
    if (s) open.push({ userId, companyId: events[events.length - 1].company_id, startedAt: s.startedAt, events: s.events });
  }
  if (!open.length) return { asked: 0, ended: 0, flagged: 0 };

  const ids = open.map((o) => o.userId);
  const [tr, te, mv] = await Promise.all([
    admin.from("trips").select("trip_id, driver_id").in("driver_id", ids).in("status", OPEN),
    admin.from("trip_events").select("actor_id, occurred_at").in("actor_id", ids).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(20000),
    admin.from("empty_moves").select("driver_id, started_at, ended_at, dispatched").in("driver_id", ids).gte("started_at", since),
  ]);
  const hasOpenTrip = new Set(((tr.data ?? []) as any[]).map((t) => t.driver_id as string));
  const lastTrip = new Map<string, number>();
  for (const e of (te.data ?? []) as any[]) { const t = Date.parse(e.occurred_at); if (t > (lastTrip.get(e.actor_id) ?? 0)) lastTrip.set(e.actor_id, t); }
  const lastMove = new Map<string, number>(); const moving = new Set<string>();
  for (const m of (mv.data ?? []) as any[]) {
    if (m.dispatched) continue;
    if (!m.ended_at) moving.add(m.driver_id);
    const t = Math.max(Date.parse(m.started_at ?? "") || 0, Date.parse(m.ended_at ?? "") || 0);
    if (t > (lastMove.get(m.driver_id) ?? 0)) lastMove.set(m.driver_id, t);
  }

  let asked = 0, ended = 0, flagged = 0;
  for (const o of open) {
    try {
      const startedMs = Date.parse(o.startedAt);
      const own = o.events.filter((e) => e.event_type !== SHIFT_IDLE_ASK && e.event_type !== SHIFT_NEEDS_CONFIRM && e.event_type !== SHIFT_END);
      const lastShiftEvent = own.reduce((m, e) => Math.max(m, Date.parse(e.occurred_at)), 0);
      const lastActivityMs = Math.max(lastShiftEvent, lastTrip.get(o.userId) ?? 0, lastMove.get(o.userId) ?? 0) || null;
      const askedAtMs = o.events.filter((e) => e.event_type === SHIFT_IDLE_ASK).reduce((m, e) => Math.max(m, Date.parse(e.occurred_at)), 0) || null;
      const flaggedAtMs = o.events.filter((e) => e.event_type === SHIFT_NEEDS_CONFIRM).reduce((m, e) => Math.max(m, Date.parse(e.occurred_at)), 0) || null;
      const d = wrapUp({ nowMs, shiftStartedMs: startedMs, lastActivityMs, askedAtMs, openTrip: hasOpenTrip.has(o.userId), moveRunning: moving.has(o.userId), flaggedAtMs });
      if (d.action === "ask") {
        if (await geotabDriving(o.companyId, o.userId)) continue; // moving right now: not the time to ask
        if (await ask(o.companyId, o.userId, nowIso)) asked++;
      }
      else if (d.action === "flag") { if (await flagNeedsConfirm(o.companyId, o.userId, nowIso)) flagged++; }
      else if (d.action === "end") { if (await closeShift(o.companyId, o.userId, o.startedAt, new Date(d.atMs).toISOString())) ended++; }
    } catch (e) { console.warn("[auto-end] driver failed:", (e as Error).message); }
  }
  return { asked, ended, flagged };
}

/** Geotab (when connected, switched on and the driver is linked) shows this driver driving right now. Never throws. */
async function geotabDriving(companyId: string, userId: string): Promise<boolean> {
  try {
    const p = await providerFor(companyId);
    if (!p) return false;
    const { data } = await getServiceSupabase().from("telematics_driver_map").select("provider_user_id").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
    const pid = (data as { provider_user_id?: string } | null)?.provider_user_id;
    if (!pid) return false;
    const own = await driverOwnProviders(companyId, [userId]);
    const h = await hosOwnFirst(p, own, userId, pid);
    return h?.status === "D";
  } catch { return false; }
}

async function flagNeedsConfirm(companyId: string, userId: string, at: string): Promise<boolean> {
  const admin = getServiceSupabase();
  const { data: mv } = await admin.from("empty_moves").select("move_id").eq("driver_id", userId).is("ended_at", null).eq("dispatched", false).order("started_at", { ascending: false }).limit(1);
  const moveId = ((mv ?? []) as { move_id: string }[])[0]?.move_id ?? null;
  const ins = await admin.from("shift_events").insert({ event_id: randomUUID(), company_id: companyId, user_id: userId, event_type: SHIFT_NEEDS_CONFIRM, occurred_at: at, actor_id: userId, source: "app", payload: { auto: true, reason: "move_unanswered", move_id: moveId } });
  if (ins.error) return false;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("company_id", companyId).eq("user_id", userId);
  await sendPush((subs ?? []) as StoredSub[], { title: "Confirm your day", body: "Open the app to confirm when your empty move ended and your shift's end.", url: "/planner/home", tag: `shift-confirm-${userId}` });
  return true;
}

async function ask(companyId: string, userId: string, at: string): Promise<boolean> {
  const admin = getServiceSupabase();
  // The ask event is the claim: a repeated tick sees it and waits for the answer.
  const ins = await admin.from("shift_events").insert({ event_id: randomUUID(), company_id: companyId, user_id: userId, event_type: SHIFT_IDLE_ASK, occurred_at: at, actor_id: userId, source: "app", payload: { auto: true } });
  if (ins.error) return false;
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("company_id", companyId).eq("user_id", userId);
  await sendPush((subs ?? []) as StoredSub[], { title: "Are you still working?", body: "Open the app and tap Still working, or your shift will end in 15 minutes.", url: "/planner/home", tag: `shift-ask-${userId}` });
  return true;
}

async function closeShift(companyId: string, userId: string, startedAt: string, at: string): Promise<boolean> {
  const admin = getServiceSupabase();
  const { data: tr } = await admin.from("trips").select("trip_id, status, truck_id, trailer_id, trip_compartment_loads(disposition), trip_deliveries(arrived_at, left_at, status)").eq("driver_id", userId).in("status", OPEN).order("started_at", { ascending: false }).limit(1);
  const trip = ((tr ?? []) as any[])[0] ?? null;
  const { data: st } = await admin.from("user_settings").select("current_truck_id, current_trailer_id").eq("user_id", userId).maybeSingle();
  const truckId: string | null = (st as any)?.current_truck_id ?? trip?.truck_id ?? null;
  const trailerId: string | null = (st as any)?.current_trailer_id ?? trip?.trailer_id ?? null;

  // Where it is: the latest captured position of the truck (or the trailer when there is no truck).
  let lat: number | null = null, lon: number | null = null, odo: number | null = null;
  const unit = truckId ? { kind: "truck", id: truckId } : trailerId ? { kind: "trailer", id: trailerId } : null;
  if (unit) {
    const { data: pos } = await admin.from("equipment_positions").select("lat, lon, odometer").eq("unit_kind", unit.kind).eq("unit_id", unit.id).maybeSingle();
    const p = pos as { lat: number; lon: number; odometer: number | null } | null;
    if (p) { lat = p.lat; lon = p.lon; odo = p.odometer != null ? Math.round(Number(p.odometer)) : null; }
  }
  const { data: locs } = await admin.from("delivery_locations").select("location_id, name, lat, lon, place_kinds").eq("company_id", companyId);
  const places = ((locs ?? []) as any[]).map((l) => ({ id: String(l.location_id), name: String(l.name), lat: l.lat != null ? Number(l.lat) : null, lon: l.lon != null ? Number(l.lon) : null, kinds: (l.place_kinds ?? []) as string[] }));
  const place = nearestPlace(lat, lon, places as any);
  const label = place?.name ?? null;

  // The shift ends first: it is the claim, so a repeated tick finds it closed and does nothing more.
  const ins = await admin.from("shift_events").insert({
    event_id: randomUUID(), company_id: companyId, user_id: userId, event_type: SHIFT_END, occurred_at: at, actor_id: userId, source: "app",
    payload: { auto: true, auto_reason: "no_response", truck_id: truckId, trailer_id: trailerId, lat, lon, odometer: odo, place_id: place?.id ?? null, place_text: label, location_source: "captured", odometer_source: "captured" },
  });
  if (ins.error) return false;

  // A load still aboard is parked preloaded where the truck stopped. A delivery arrived at and never finished is not
  // parked (the Finish tap is what's missing): the driver is asked to finish it and dispatch can see it.
  const aboard = ((trip?.trip_compartment_loads ?? []) as any[]).some((c) => c.disposition === "loaded");
  const midDelivery = !!trip && ((trip.trip_deliveries ?? []) as any[]).some(isOpenDelivery);
  if (trip && midDelivery) {
    await admin.from("trip_events").insert({ event_id: randomUUID(), trip_id: trip.trip_id, event_type: "finish_needed", occurred_at: at, actor_id: userId, payload: { auto: true, reason: "shift_ended_mid_delivery", from_status: trip.status } });
  } else if (trip && aboard) {
    const now = new Date().toISOString();
    await admin.from("trips").update({ status: "parked", parked_at: at, parked_by: userId, parked_for: "layover", parked_where: label, parked_note: "Parked automatically when the shift ended.", client_updated_at: now }).eq("trip_id", trip.trip_id).in("status", OPEN);
    await admin.from("trip_events").insert({ event_id: randomUUID(), trip_id: trip.trip_id, event_type: "parked", occurred_at: at, actor_id: userId, payload: { auto: true, parked_for: "layover", where: label, from_status: trip.status } });
  }
  // A move still running here (a race; wrapUp never closes one) ends with NO ending odometer: the last captured reading is usually its
  // own beginning, and inventing miles is worse than a gap the driver or staff can fill. Planned (dispatched) ones keep waiting.
  const { data: openMoves } = await admin.from("empty_moves").select("move_id, dispatched").eq("driver_id", userId).is("ended_at", null);
  const running = ((openMoves ?? []) as { move_id: string; dispatched?: boolean | null }[]).filter((m) => !m.dispatched).map((m) => m.move_id);
  if (running.length) await admin.from("empty_moves").update({ ended_at: at, end_miles: null, client_updated_at: new Date().toISOString() }).in("move_id", running);

  // Equipment: let go of the claim (the pairing stays coupled and free); empty equipment goes to Readyline unless its
  // status was already set during this shift. A trailer left loaded is the parked trip above, preloaded, where it sits.
  let setStatus = !aboard;
  if (truckId && setStatus) {
    const { data: t } = await admin.from("trucks").select("status_updated_at").eq("truck_id", truckId).maybeSingle();
    const su = (t as { status_updated_at?: string | null } | null)?.status_updated_at;
    if (su && Date.parse(su) >= Date.parse(startedAt)) setStatus = false;
  }
  if (truckId || trailerId) {
    const rr = await admin.rpc("auto_park_equipment", { p_user_id: userId, p_truck_id: truckId, p_trailer_id: trailerId, p_lat: lat, p_lon: lon, p_label: label, p_place_id: place?.id ?? null, p_set_status: setStatus, p_notes: "Shift ended automatically" });
    if (rr.error) console.warn("[auto-end] park failed:", rr.error.message);
  }

  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("company_id", companyId).eq("user_id", userId);
  const when = new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: process.env.REPORT_TZ || "America/New_York" });
  await sendPush((subs ?? []) as StoredSub[], { title: midDelivery ? "Finish your delivery" : "Your shift was ended", body: midDelivery ? `We ended your shift at ${when}, but your delivery is still open. Open the app and tap Finish Delivery so it's recorded.` : `We ended your shift at ${when}${label ? ` at ${label}` : ""} because we didn't hear back. Open the app to confirm your day.`, url: "/planner/home", tag: `auto-end-${userId}` });
  return true;
}
