// app/api/cron/hos-alerts/route.ts
//
// Run every few minutes by a database schedule (pg_cron -> pg_net), with
// `Authorization: Bearer $CRON_SECRET`. For every company with a Geotab link:
// read the clocks and positions of drivers on a load, work out who is newly low
// on hours or can't cover their trip, and send web push to the driver and to
// dispatch. What's been announced is kept in hos_alert_state so a run never
// repeats itself.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { autoLinkAllDrivers, providerFor } from "@/lib/telematics/server";
import { planHosAlerts, type DriverCase } from "@/lib/push/hosAlertCore";
import { sendPush, type StoredSub } from "@/lib/push/send";
import type { Level } from "@/lib/telematics/hosTripNotify";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPEN = ["loading", "in_transit", "delivering"];
const STAFF = ["admin", "owner", "dispatch", "lead"];

async function runCompany(companyId: string): Promise<{ sent: number; drivers: number }> {
  const admin = getServiceSupabase();
  const p = await providerFor(companyId);
  if (!p) return { sent: 0, drivers: 0 };

  const { data: tripRows } = await admin.from("trips")
    .select("trip_id, driver_id, truck_id, trip_pickups(seq, terminal_id, left_at, outcome), trip_deliveries(seq, location_id, status)")
    .eq("company_id", companyId).in("status", OPEN);
  const trips = ((tripRows ?? []) as any[]).filter((t) => t.driver_id);
  if (!trips.length) return { sent: 0, drivers: 0 };

  // Drivers on open trips who aren't linked yet get matched now, so their alerts don't wait on an admin.
  try { await autoLinkAllDrivers(companyId); } catch { /* alerts go out for whoever is linked */ }

  const driverIds = [...new Set(trips.map((t) => t.driver_id as string))];
  const truckIds = [...new Set(trips.map((t) => t.truck_id).filter(Boolean) as string[])];
  const termIds = new Set<string>(), locIds = new Set<string>();
  for (const t of trips) {
    for (const k of t.trip_pickups ?? []) if (k.terminal_id) termIds.add(String(k.terminal_id));
    for (const d of t.trip_deliveries ?? []) if (d.location_id) locIds.add(String(d.location_id));
  }

  const [dm, vm, terms, locs, prev, profs, trucks, positions] = await Promise.all([
    admin.from("telematics_driver_map").select("provider_user_id, user_id").eq("company_id", companyId).in("user_id", driverIds),
    admin.from("telematics_vehicle_map").select("provider_vehicle_id, truck_id").eq("company_id", companyId),
    termIds.size ? admin.from("terminals").select("terminal_id, lat, lon").in("terminal_id", [...termIds]) : Promise.resolve({ data: [] as any[] }),
    locIds.size ? admin.from("delivery_locations").select("location_id, lat, lon").in("location_id", [...locIds]) : Promise.resolve({ data: [] as any[] }),
    admin.from("hos_alert_state").select("user_id, trip_level, low_level").eq("company_id", companyId),
    admin.from("profiles").select("user_id, display_name").in("user_id", driverIds),
    truckIds.length ? admin.from("trucks").select("truck_id, truck_name").in("truck_id", truckIds) : Promise.resolve({ data: [] as any[] }),
    p.positions().catch(() => new Map()),
  ]);

  const provUser = new Map(((dm.data ?? []) as any[]).map((r) => [r.user_id as string, r.provider_user_id as string]));
  const vehOfTruck = new Map(((vm.data ?? []) as any[]).map((r) => [r.truck_id as string, r.provider_vehicle_id as string]));
  const ll = (r: any) => (r?.lat != null && r?.lon != null ? { lat: Number(r.lat), lon: Number(r.lon) } : null);
  const termLL = new Map(((terms.data ?? []) as any[]).map((r) => [String(r.terminal_id), ll(r)]));
  const locLL = new Map(((locs.data ?? []) as any[]).map((r) => [String(r.location_id), ll(r)]));
  const prevBy = new Map(((prev.data ?? []) as any[]).map((r) => [r.user_id as string, r]));
  const nameOf = new Map(((profs.data ?? []) as any[]).map((r) => [r.user_id as string, r.display_name as string | null]));
  const truckName = new Map(((trucks.data ?? []) as any[]).map((r) => [r.truck_id as string, r.truck_name as string]));

  // The clocks for each driver on a load (a few at a time).
  const hosOf = new Map<string, { driveLeftMin: number | null; dutyLeftMin: number | null; at: string }>();
  const need = driverIds.filter((u) => provUser.has(u));
  for (let i = 0; i < need.length; i += 4) {
    await Promise.all(need.slice(i, i + 4).map(async (u) => {
      try { const x = await p.hos(provUser.get(u)!); if (x) hosOf.set(u, { driveLeftMin: x.driveLeftMin, dutyLeftMin: x.dutyLeftMin, at: x.at }); } catch { /* no clocks for this driver */ }
    }));
  }

  const cases: DriverCase[] = [];
  for (const u of driverIds) {
    const trip = trips.find((t) => t.driver_id === u);
    if (!trip || !hosOf.has(u)) continue;
    const pk = ((trip.trip_pickups ?? []) as any[]).filter((k) => !k.left_at && k.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
    const dl = ((trip.trip_deliveries ?? []) as any[]).filter((d) => d.status !== "complete" && d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
    const veh = trip.truck_id ? vehOfTruck.get(trip.truck_id) : undefined;
    const pos = veh ? positions.get(veh) : null;
    const pr = prevBy.get(u);
    cases.push({
      userId: u, name: nameOf.get(u) ?? "A driver", truckName: trip.truck_id ? truckName.get(trip.truck_id) ?? null : null,
      hos: hosOf.get(u)!,
      pos: pos && pos.lat != null && pos.lon != null ? { lat: pos.lat, lon: pos.lon, at: pos.at } : null,
      racksLeft: pk.map((k) => (k.terminal_id ? termLL.get(String(k.terminal_id)) ?? null : null)),
      dropsLeft: dl.map((d) => (d.location_id ? locLL.get(String(d.location_id)) ?? null : null)),
      prevTrip: pr ? (pr.trip_level as Level) : null,
      prevLow: pr && pr.low_level !== "none" ? (pr.low_level as "orange" | "red") : null,
    });
  }

  const { notifications, state } = planHosAlerts(cases, Date.now());
  let sent = 0;
  if (notifications.length) {
    const { data: staffRows } = await admin.from("user_companies").select("user_id").eq("company_id", companyId).in("role", STAFF);
    const staffIds = ((staffRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    const wanted = [...new Set([...notifications.filter((n) => n.to === "driver").map((n) => n.userId), ...staffIds])];
    const { data: subRows } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth, user_id").eq("company_id", companyId).in("user_id", wanted);
    const subs = (subRows ?? []) as (StoredSub & { user_id: string })[];
    for (const n of notifications) {
      const targets = n.to === "driver" ? subs.filter((s) => s.user_id === n.userId) : subs.filter((s) => staffIds.includes(s.user_id));
      sent += await sendPush(targets, { title: n.title, body: n.body, url: n.url, tag: n.tag });
    }
  }
  if (state.length) {
    await admin.from("hos_alert_state").upsert(state.map((s) => ({ company_id: companyId, user_id: s.userId, trip_level: s.trip, low_level: s.low, updated_at: new Date().toISOString() })), { onConflict: "company_id,user_id" });
  }
  return { sent, drivers: cases.length };
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { data } = await getServiceSupabase().from("telematics_connections").select("company_id").eq("status", "active");
  const out: Record<string, { sent: number; drivers: number } | string> = {};
  for (const c of (data ?? []) as { company_id: string }[]) {
    try { out[c.company_id] = await runCompany(c.company_id); } catch (e) { out[c.company_id] = (e as Error).message; }
  }
  return NextResponse.json({ ok: true, companies: out });
}
