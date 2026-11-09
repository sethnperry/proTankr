// lib/trips/abandonedServer.ts
//
// Server side of abandoned.ts, run on the five-minute tick: cancel abandoned loads, and on Monday morning
// email each company's admins the cancelled loads that were never redispatched, then delete cancelled loads
// older than a week. Service client; never import from the browser.
import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendEmail } from "@/lib/notify/server";
import {
  abandonedTrips, AUTO_REASON, ABANDON_AFTER_H, deleteBefore, reportDue, reportSince, reportText, wasRedispatched, weekKey,
  type CancelledTrip, type LaterTrip, type ReportRow,
} from "./abandoned";

const TZ = process.env.REPORT_TZ || "America/New_York";
const ms = (v: unknown) => (v ? Date.parse(String(v)) : 0) || 0;

export async function cancelAbandoned(nowMs: number): Promise<number> {
  const admin = getServiceSupabase();
  const { data } = await admin.from("trips")
    .select("trip_id, status, created_at, updated_at, client_updated_at, started_at, trip_events(occurred_at), trip_compartment_loads(disposition)")
    .in("status", ["draft", "loading"]).limit(2000);
  const open = ((data ?? []) as any[]).map((t) => ({
    tripId: String(t.trip_id), status: String(t.status),
    lastActivityMs: Math.max(ms(t.created_at), ms(t.updated_at), ms(t.client_updated_at), ms(t.started_at), ...((t.trip_events ?? []) as any[]).map((e) => ms(e.occurred_at))),
    productAboard: ((t.trip_compartment_loads ?? []) as any[]).some((c) => c.disposition === "loaded"),
  }));
  const ids = abandonedTrips(open, nowMs);
  if (!ids.length) return 0;
  const at = new Date(nowMs).toISOString();
  const { data: done } = await admin.from("trips").update({
    status: "cancelled", cancelled_at: at, cancel_reasons: [AUTO_REASON], cancel_note: `No activity for ${ABANDON_AFTER_H} hours.`, client_updated_at: at,
  }).in("trip_id", ids).in("status", ["draft", "loading"]).select("trip_id");
  return (done ?? []).length;
}

function whyText(t: any): string {
  const r: string[] = t.cancel_reasons ?? [];
  const base = r.includes(AUTO_REASON) ? `Auto-cancelled: no activity for ${ABANDON_AFTER_H} hours.` : r.includes("dispatch_cancelled") ? "Cancelled by dispatch." : r.length ? `Cancelled by the driver (${r.join(", ").replace(/_/g, " ")}).` : "Cancelled.";
  return t.cancel_note && !r.includes(AUTO_REASON) ? `${base} ${t.cancel_note}` : base;
}

async function weeklyFor(companyId: string, nowMs: number): Promise<{ reported: number; deleted: number } | null> {
  const admin = getServiceSupabase();
  const wk = weekKey(nowMs, TZ);
  const { data: ran } = await admin.from("trip_cleanup_runs").select("week_start").eq("company_id", companyId).eq("week_start", wk).maybeSingle();
  if (ran) return null;

  const since = reportSince(nowMs);
  const { data: cx } = await admin.from("trips")
    .select("trip_id, driver_id, created_at, cancelled_at, cancel_reasons, cancel_note, trip_orders(order_number), trip_pickups(seq, terminal_id, name), trip_deliveries(seq, location_id, one_off_name)")
    .eq("company_id", companyId).eq("status", "cancelled").gte("cancelled_at", since).limit(1000);
  const cancelled = (cx ?? []) as any[];

  const first = (a: any[] | null | undefined) => [...(a ?? [])].sort((x, y) => x.seq - y.seq)[0] ?? null;
  const shape = (t: any): LaterTrip => ({
    tripId: String(t.trip_id), driverId: t.driver_id ?? null, createdMs: ms(t.created_at),
    terminalId: first(t.trip_pickups)?.terminal_id ? String(first(t.trip_pickups).terminal_id) : null,
    locationId: first(t.trip_deliveries)?.location_id ? String(first(t.trip_deliveries).location_id) : null,
    orderNumbers: ((t.trip_orders ?? []) as any[]).map((o) => String(o.order_number ?? "")).filter(Boolean),
  });

  let rows: ReportRow[] = [];
  if (cancelled.length) {
    const minCreated = new Date(Math.min(...cancelled.map((t) => ms(t.created_at)))).toISOString();
    const { data: lx } = await admin.from("trips")
      .select("trip_id, driver_id, created_at, trip_orders(order_number), trip_pickups(seq, terminal_id), trip_deliveries(seq, location_id)")
      .eq("company_id", companyId).neq("status", "cancelled").gte("created_at", minCreated).limit(3000);
    const later = ((lx ?? []) as any[]).map(shape);
    const keep = cancelled.filter((t) => !wasRedispatched({ ...shape(t), cancelledMs: ms(t.cancelled_at) } as CancelledTrip, later));
    if (keep.length) {
      const dIds = [...new Set(keep.map((t) => t.driver_id).filter(Boolean))], lIds = [...new Set(keep.map((t) => first(t.trip_deliveries)?.location_id).filter(Boolean))];
      const [pr, lc] = await Promise.all([
        dIds.length ? admin.from("profiles").select("user_id, display_name").in("user_id", dIds) : Promise.resolve({ data: [] as any[] }),
        lIds.length ? admin.from("delivery_locations").select("location_id, name").in("location_id", lIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const who = new Map<string, string>(((pr.data ?? []) as any[]).map((p) => [p.user_id, p.display_name]));
      const loc = new Map<string, string>(((lc.data ?? []) as any[]).map((l) => [l.location_id, l.name]));
      const when = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
      rows = keep.sort((a, b) => ms(a.cancelled_at) - ms(b.cancelled_at)).map((t) => ({
        driver: who.get(t.driver_id) ?? "Driver", when: when(t.cancelled_at),
        route: `${first(t.trip_pickups)?.name ?? "Rack"} → ${loc.get(first(t.trip_deliveries)?.location_id) ?? first(t.trip_deliveries)?.one_off_name ?? "delivery"}`,
        order: shape(t).orderNumbers.join(", "), why: whyText(t),
      }));
    }
  }

  if (rows.length) {
    const { data: members } = await admin.from("user_companies").select("user_id, role").eq("company_id", companyId).in("role", ["owner", "admin"]);
    const emails: string[] = [];
    for (const m of (members ?? []) as { user_id: string }[]) {
      const u = await admin.auth.admin.getUserById(m.user_id).catch(() => null);
      if (u?.data?.user?.email) emails.push(u.data.user.email);
    }
    const { data: co } = await admin.from("companies").select("company_name").eq("company_id", companyId).maybeSingle();
    if (emails.length) { const m = reportText(rows, (co as any)?.company_name ?? "your company"); await sendEmail([...new Set(emails)], m.subject, m.text); }
  }

  // Delete only after the report went out (a failed send throws above, so the next tick retries).
  const { data: gone } = await admin.from("trips").delete().eq("company_id", companyId).eq("status", "cancelled").lt("cancelled_at", deleteBefore(nowMs)).select("trip_id");
  await admin.from("trip_cleanup_runs").insert({ company_id: companyId, week_start: wk, reported: rows.length, deleted: (gone ?? []).length });
  return { reported: rows.length, deleted: (gone ?? []).length };
}

export async function runAbandonedTrips(nowMs = Date.now()): Promise<{ cancelled: number; weekly: Record<string, { reported: number; deleted: number } | string> }> {
  const cancelled = await cancelAbandoned(nowMs);
  const weekly: Record<string, { reported: number; deleted: number } | string> = {};
  if (reportDue(nowMs, TZ)) {
    const { data } = await getServiceSupabase().from("companies").select("company_id").limit(500);
    for (const c of (data ?? []) as { company_id: string }[]) {
      try { const r = await weeklyFor(c.company_id, nowMs); if (r) weekly[c.company_id] = r; } catch (e) { weekly[c.company_id] = (e as Error).message; }
    }
  }
  return { cancelled, weekly };
}
