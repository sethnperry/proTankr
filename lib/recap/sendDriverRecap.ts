// lib/recap/sendDriverRecap.ts
//
// After a driver's 34-hour reset: email the recap of their last finished pay period. With no pay
// period set yet, send the one-time note asking them to set it in their profile. Called from the
// hos-alerts cron with each driver's current off-duty stretch.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import type { TelematicsProvider } from "@/lib/telematics/types";
import { generatePayPeriods, type PayPeriodType } from "@/app/admin/payPeriods";
import { dailyHours } from "./dailyHours";
import { buildRecap, localDate, type RecapPurchase, type RecapStop, type RecapTrip } from "./buildRecap";
import { recapSubject, renderPayPeriodNudgeHtml, renderRecapHtml } from "./renderRecapEmail";

export const RESET_MS = 34 * 3600_000;
const DEFAULT_TZ = "America/New_York";

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from: `ProTankr <${from}>`, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

const appUrl = () => `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://www.protankr.com").replace(/\/$/, "")}/profile`;

/** True when this stretch of off-duty time is long enough to be a 34-hour reset. */
export function resetReached(offSinceIso: string | null | undefined, nowMs: number): boolean {
  return !!offSinceIso && nowMs - Date.parse(offSinceIso) >= RESET_MS;
}

export async function maybeSendRecap(o: {
  companyId: string; userId: string; providerDriverId: string; provider: TelematicsProvider;
  offSince: string; nowMs?: number; tz?: string;
}): Promise<"sent" | "nudged" | "skipped"> {
  const admin = getServiceSupabase();
  const nowMs = o.nowMs ?? Date.now();
  if (!resetReached(o.offSince, nowMs)) return "skipped";
  const key = new Date(o.offSince).toISOString();
  const { data: st } = await admin.from("driver_recap_state").select("*").eq("user_id", o.userId).maybeSingle();
  const state = st as { last_restart_key: string | null; last_period_end: string | null; intro_sent_at: string | null } | null;
  if (state?.last_restart_key && Date.parse(state.last_restart_key) === Date.parse(key)) return "skipped";
  const save = (patch: Record<string, unknown>) => admin.from("driver_recap_state").upsert({ user_id: o.userId, company_id: o.companyId, last_restart_key: key, updated_at: new Date().toISOString(), ...patch }, { onConflict: "user_id" });

  const [{ data: u }, { data: prof }, { data: pay }] = await Promise.all([
    admin.auth.admin.getUserById(o.userId),
    admin.from("profiles").select("display_name").eq("user_id", o.userId).maybeSingle(),
    admin.from("driver_pay_settings").select("pay_period_type, pay_period_anchor_date").eq("user_id", o.userId).maybeSingle(),
  ]);
  const email = u?.user?.email;
  const name = ((prof as { display_name?: string | null } | null)?.display_name ?? "").trim();
  if (!email) { await save({}); return "skipped"; }

  const type = (pay as { pay_period_type?: string | null } | null)?.pay_period_type as PayPeriodType | null | undefined;
  const anchor = (pay as { pay_period_anchor_date?: string | null } | null)?.pay_period_anchor_date;
  const tz = o.tz || DEFAULT_TZ;
  if (!type || !anchor) {
    // First reset with no pay period yet: one note, never repeated.
    if (state?.intro_sent_at) { await save({}); return "skipped"; }
    await sendEmail(email, "Set your pay period in ProTankr", renderPayPeriodNudgeHtml(name, appUrl()));
    await save({ intro_sent_at: new Date().toISOString() });
    return "nudged";
  }

  const today = localDate(new Date(nowMs).toISOString(), tz);
  const period = generatePayPeriods(type, anchor, 6, today).find((p) => p.end < today);
  if (!period || (state?.last_period_end && state.last_period_end >= period.end)) { await save({}); return "skipped"; }

  const fromIso = new Date(Date.parse(`${period.start}T00:00:00Z`) - 86400_000).toISOString();
  const toIso = new Date(Date.parse(`${period.end}T00:00:00Z`) + 2 * 86400_000).toISOString();

  // Hours from the electronic log (a failure just leaves them out).
  let hours = null as ReturnType<typeof dailyHours> | null;
  try { hours = dailyHours(await o.provider.dutyLogs(o.providerDriverId, fromIso, toIso), tz, period.start, period.end, nowMs); } catch (e) { console.warn("[recap] duty logs failed:", (e as Error).message); }

  const { data: tripRows } = await admin.from("trips")
    .select("trip_id, status, started_at, completed_at, begin_miles, end_miles, trip_orders(order_number, is_primary), trip_pickups(seq, name, city, state, arrived_at, left_at, outcome, no_load_reason), trip_deliveries(seq, location_id, one_off_name, arrived_at, left_at, status)")
    .eq("driver_id", o.userId).gte("started_at", fromIso).lte("started_at", toIso).not("status", "in", "(cancelled,draft,dispatched)");
  const raw = ((tripRows ?? []) as any[]).filter((t) => t.started_at && localDate(t.started_at, tz) >= period.start && localDate(t.started_at, tz) <= period.end);
  const locIds = [...new Set(raw.flatMap((t) => (t.trip_deliveries ?? []).map((d: any) => d.location_id).filter(Boolean)))] as string[];
  const tripIds = raw.map((t) => t.trip_id as string);
  const [{ data: locs }, { data: comps }] = await Promise.all([
    locIds.length ? admin.from("delivery_locations").select("location_id, name, location_number, city, state").in("location_id", locIds) : Promise.resolve({ data: [] as any[] }),
    tripIds.length ? admin.from("trip_compartment_loads").select("trip_id, gross_gallons, disposition").in("trip_id", tripIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const locName = new Map(((locs ?? []) as any[]).map((l) => [l.location_id as string, `${l.location_number ? `#${l.location_number} ` : ""}${l.name ?? ""}${l.city ? `, ${l.city}` : ""}`.trim()]));
  const gallons = new Map<string, number>();
  for (const c of (comps ?? []) as any[]) if (c.disposition !== "cancelled") gallons.set(c.trip_id, (gallons.get(c.trip_id) ?? 0) + Number(c.gross_gallons ?? 0));
  const trips: RecapTrip[] = raw.map((t) => {
    const stops: RecapStop[] = [
      ...((t.trip_pickups ?? []) as any[]).map((p) => ({ seq: p.seq as number, kind: "pickup" as const, name: [p.name, p.city ? `${p.city}${p.state ? `, ${p.state}` : ""}` : null].filter(Boolean).join(" · ") || "Terminal", arrivedAt: p.arrived_at ?? null, leftAt: p.left_at ?? null, note: p.outcome === "no_load" ? "couldn't load" : null })),
      ...((t.trip_deliveries ?? []) as any[]).filter((d) => d.status !== "cancelled").map((d) => ({ seq: 1000 + (d.seq as number), kind: "delivery" as const, name: (d.location_id && locName.get(d.location_id)) || d.one_off_name || "Delivery", arrivedAt: d.arrived_at ?? null, leftAt: d.left_at ?? null, note: null })),
    ].sort((a, b) => a.seq - b.seq).map(({ seq: _seq, ...s }) => s);
    const orders = ((t.trip_orders ?? []) as any[]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((x) => String(x.order_number)).filter(Boolean);
    return { tripId: t.trip_id, orders, startedAt: t.started_at, completedAt: t.completed_at ?? null, beginMiles: t.begin_miles != null ? Number(t.begin_miles) : null, endMiles: t.end_miles != null ? Number(t.end_miles) : null, gallons: gallons.get(t.trip_id) ?? 0, stops };
  });

  // Purchases the driver paid for (their own card or cash).
  const { data: fuel } = await admin.from("fuel_purchases")
    .select("id, started_at, finished_at, store_name, store_number, city, state, diesel_gallons, pay_kind, status")
    .eq("driver_id", o.userId).in("pay_kind", ["personal_card", "cash"]).gte("started_at", fromIso).lte("started_at", toIso).neq("status", "fueling");
  const fuelRows = ((fuel ?? []) as any[]).filter((f) => localDate(f.started_at, tz) >= period.start && localDate(f.started_at, tz) <= period.end);
  const { data: pays } = fuelRows.length ? await admin.from("fuel_purchase_payments").select("purchase_id, total_amount").in("purchase_id", fuelRows.map((f) => f.id)) : { data: [] as any[] };
  const amt = new Map(((pays ?? []) as any[]).map((p) => [p.purchase_id as string, p.total_amount != null ? Number(p.total_amount) : null]));
  const purchases: RecapPurchase[] = fuelRows.map((f) => ({
    at: f.finished_at ?? f.started_at, store: `${f.store_name ?? "Fuel stop"}${f.store_number ? ` #${f.store_number}` : ""}`, place: [f.city, f.state].filter(Boolean).join(", "),
    gallons: f.diesel_gallons != null ? Number(f.diesel_gallons) : null, kind: f.pay_kind, amount: amt.get(f.id) ?? null,
  }));

  const recap = buildRecap({ driverName: name || email, period: { start: period.start, end: period.end }, tz, hours, trips, purchases });
  await sendEmail(email, recapSubject(recap), renderRecapHtml(recap));
  await save({ last_period_end: period.end });
  return "sent";
}
