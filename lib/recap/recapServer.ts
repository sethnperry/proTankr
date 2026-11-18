// lib/recap/recapServer.ts
//
// Loads one company's week, builds the Weekly Recap from it, stores the snapshot, and (on the Monday schedule)
// emails the PDF to admin and dispatch. Server only (service client).

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveShifts, type Shift } from "../shifts/shiftLogic.ts";
import { addDays, localDateOf, localMidnightMs } from "../worklog/time.ts";
import { loggedDelays } from "../trips/delays.ts";
import { aggregateUtilization } from "../capacity/computeUtilization.ts";
import type { ShiftEventRow, TripEventRow } from "../trips/types.ts";
import { DEFAULT_RECAP_SETTINGS, type LatLon, type RecapDriver, type RecapSettings, type RecapSpan, type RecapTrip, type Segment } from "./types.ts";
import { cutShift, type PlaceNames } from "./segments.ts";
import { buildStandards } from "./standards.ts";
import { scoreShifts } from "./score.ts";
import { buildRecap, type DriverRecovery, type PriorRecap, type Recap } from "./report.ts";
import { PdfDoc } from "../pdf/doc.ts";
import { drawRecap } from "./recapPdf.ts";
import { email } from "../eod/eodServer.ts";

const rows = async <T>(p: PromiseLike<{ data: unknown }>): Promise<T[]> => ((await p).data ?? []) as T[];
const HISTORY_DAYS = 90;

export type RecapSettingsRow = { company_id: string; enabled: boolean; recipients: string[]; tz: string; send_at: string; last_for_week: string | null; allowances: Partial<RecapSettings>; version: number };

export function mergeSettings(row: Pick<RecapSettingsRow, "allowances"> | null): RecapSettings {
  const clean: Partial<RecapSettings> = {};
  for (const [k, v] of Object.entries(row?.allowances ?? {})) if (k in DEFAULT_RECAP_SETTINGS && Number.isFinite(Number(v))) (clean as Record<string, number>)[k] = Number(v);
  return { ...DEFAULT_RECAP_SETTINGS, ...clean };
}

/** The Monday on or before a local date. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  return addDays(date, -back);
}

export async function loadSettings(admin: SupabaseClient, companyId: string): Promise<RecapSettingsRow> {
  const { data } = await admin.from("weekly_recap_settings").select("*").eq("company_id", companyId).maybeSingle();
  return (data as RecapSettingsRow | null) ?? { company_id: companyId, enabled: false, recipients: [], tz: "America/New_York", send_at: "04:00", last_for_week: null, allowances: {}, version: 1 };
}

export async function buildWeeklyRecap(admin: SupabaseClient, companyId: string, weekStart: string): Promise<Recap> {
  const sRow = await loadSettings(admin, companyId);
  const settings = mergeSettings(sRow);
  const tz = sRow.tz;
  const weekEnd = addDays(weekStart, 6);
  const startMs = localMidnightMs(weekStart, tz), endMs = localMidnightMs(addDays(weekStart, 7), tz);
  const nowIso = new Date().toISOString();

  const members = await rows<{ user_id: string; role: string }>(admin.from("user_companies").select("user_id, role").eq("company_id", companyId));
  const ids = members.map((m) => m.user_id);
  const profs = ids.length ? await rows<{ user_id: string; display_name: string | null; region: string | null; local_area: string | null }>(admin.from("profiles").select("user_id, display_name, region, local_area").in("user_id", ids)) : [];
  const { data: co } = await admin.from("companies").select("company_name").eq("company_id", companyId).maybeSingle();

  // Shifts that started this week and are finished.
  const events = ids.length ? await rows<ShiftEventRow>(admin.from("shift_events").select("*").eq("company_id", companyId).gte("occurred_at", new Date(startMs - 36 * 3600_000).toISOString()).lte("occurred_at", new Date(endMs + 6 * 3600_000).toISOString()).order("occurred_at").limit(20000)) : [];
  const shifts: Shift[] = [];
  for (const u of ids) for (const s of deriveShifts(events, u, nowIso)) {
    const a = Date.parse(s.startedAt);
    if (!s.open && s.endedAt && a >= startMs && a < endMs) shifts.push(s);
  }
  const drivers: RecapDriver[] = profs.filter((p) => shifts.some((s) => s.userId === p.user_id)).map((p) => ({ userId: p.user_id, name: p.display_name || "Driver", region: p.region, area: p.local_area }));

  // Trips: this week's, plus the company's history for the standards.
  const histFrom = new Date(startMs - HISTORY_DAYS * 86400_000).toISOString();
  const tripRows = await rows<{ trip_id: string; driver_id: string; started_at: string | null; completed_at: string | null }>(admin.from("trips").select("trip_id, driver_id, started_at, completed_at").eq("company_id", companyId).eq("status", "complete").gte("completed_at", histFrom).lte("completed_at", new Date(endMs + 86400_000).toISOString()).limit(5000));
  const tripIds = tripRows.map((t) => t.trip_id);
  const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
  const many = async <T,>(table: string, ids2: string[]) => { const out: T[] = []; for (const c of chunk(ids2, 150)) out.push(...await rows<T>(admin.from(table).select("*").in("trip_id", c))); return out; };
  const [pickups, deliveries, comps, tripEvents] = tripIds.length
    ? await Promise.all([many<any>("trip_pickups", tripIds), many<any>("trip_deliveries", tripIds), many<any>("trip_compartment_loads", tripIds), many<TripEventRow>("trip_events", tripIds)])
    : [[], [], [], []] as [any[], any[], any[], TripEventRow[]];

  const terminalIds = [...new Set(pickups.map((p: any) => p.terminal_id).filter(Boolean))] as string[];
  const locationIds = [...new Set(deliveries.map((d: any) => d.location_id).filter(Boolean))] as string[];
  const terms = terminalIds.length ? await rows<{ terminal_id: string; terminal_name: string | null; lat: number | null; lon: number | null }>(admin.from("terminals").select("terminal_id, terminal_name, lat, lon").in("terminal_id", terminalIds)) : [];
  const locs = locationIds.length ? await rows<{ location_id: string; name: string; location_number: string | null; lat: number | null; lon: number | null }>(admin.from("delivery_locations").select("location_id, name, location_number, lat, lon").in("location_id", locationIds)) : [];
  const termMap = new Map(terms.map((t) => [t.terminal_id, t]));
  const locMap = new Map(locs.map((l) => [l.location_id, l]));
  const coordMap = new Map<string, LatLon>();
  for (const t of terms) if (t.lat != null && t.lon != null) coordMap.set(`t:${t.terminal_id}`, { lat: Number(t.lat), lon: Number(t.lon) });
  for (const l of locs) if (l.lat != null && l.lon != null) coordMap.set(`l:${l.location_id}`, { lat: Number(l.lat), lon: Number(l.lon) });
  const names: PlaceNames = {
    terminal: (id) => (id ? termMap.get(id)?.terminal_name ?? "" : ""),
    location: (id) => { const l = id ? locMap.get(id) : null; return l ? `${l.name}${l.location_number ? ` ${l.location_number}` : ""}` : ""; },
  };
  const coords = (key: string | null) => (key ? coordMap.get(key) ?? null : null);

  const trips: RecapTrip[] = tripRows.map((t) => {
    const ev = tripEvents.filter((e: TripEventRow) => e.trip_id === t.trip_id);
    const gallons = comps.filter((c: any) => c.trip_id === t.trip_id && c.disposition !== "cancelled").reduce((n: number, c: any) => n + Number(c.gross_gallons ?? 0), 0);
    return {
      tripId: t.trip_id, userId: t.driver_id, startedAt: t.started_at, completedAt: t.completed_at, gallons,
      pickups: pickups.filter((p: any) => p.trip_id === t.trip_id).sort((a: any, b: any) => a.seq - b.seq).map((p: any) => ({ pickupId: p.pickup_id, terminalId: p.terminal_id, name: p.name, arrivedAt: p.arrived_at, beginAt: p.begin_at, leftAt: p.left_at, outcome: p.outcome ?? null, noLoadReason: p.no_load_reason ?? null, hasDelayNote: !!(p.delay_reason_id || p.delay_note) })),
      deliveries: deliveries.filter((d: any) => d.trip_id === t.trip_id).sort((a: any, b: any) => a.seq - b.seq).map((d: any) => ({ deliveryId: d.delivery_id, locationId: d.location_id, name: d.one_off_name, arrivedAt: d.arrived_at, beginAt: d.begin_at, leftAt: d.left_at, signed: !!d.driver_signed_at, hasDelayNote: !!(d.delay_reason_id || d.delay_note) })),
      delays: loggedDelays(ev),
    };
  });
  const weekTrips = trips.filter((t) => t.completedAt && Date.parse(t.completedAt) >= startMs && Date.parse(t.completedAt) < endMs);

  // Empty moves and fuel stops during the week.
  const spans: RecapSpan[] = [];
  const memberIds = ids.length ? ids : ["none"];
  for (const m of await rows<{ driver_id: string; started_at: string; ended_at: string | null; to_place?: string | null }>(admin.from("empty_moves").select("driver_id, started_at, ended_at").in("driver_id", memberIds).gte("started_at", new Date(startMs - 86400_000).toISOString()).lte("started_at", new Date(endMs).toISOString()))) if (m.ended_at) spans.push({ userId: m.driver_id, from: m.started_at, to: m.ended_at, kind: "empty_move" });
  for (const f of await rows<{ driver_id: string; started_at: string; finished_at: string | null }>(admin.from("fuel_purchases").select("driver_id, started_at, finished_at").in("driver_id", memberIds).gte("started_at", new Date(startMs - 86400_000).toISOString()).lte("started_at", new Date(endMs).toISOString()))) if (f.finished_at) spans.push({ userId: f.driver_id, from: f.started_at, to: f.finished_at, kind: "fuel" });

  // Standards from the company's own history (trips before this week; a driver's own week doesn't set their bar).
  const hist: Segment[] = [];
  for (const t of trips) {
    if (!t.startedAt || !t.completedAt || Date.parse(t.completedAt) >= startMs) continue;
    const syn: Shift = { userId: t.userId, startedAt: t.startedAt, endedAt: t.completedAt, open: false, unconfirmed: false, startSource: "app", endSource: "app", events: [], hours: 0 };
    hist.push(...cutShift(syn, [t], [], names, settings, tz).filter((g) => g.type !== "gray"));
  }
  const version = `${weekEnd.slice(0, 7)}`;
  const std = buildStandards(hist, settings, version);
  const scores = scoreShifts(shifts.map((sh) => ({ shift: sh, segments: cutShift(sh, trips, spans, names, settings, tz) })), std, settings, coords);

  // Recovery %: the existing payload-utilization numbers for the week (the benchmark system it was first specified on is gone).
  const util = await rows<any>(admin.from("load_utilization").select("driver_id, effective_available_gallons, actual_gallons, unused_gallons, eligibility").eq("company_id", companyId).gte("loaded_at", new Date(startMs).toISOString()).lt("loaded_at", new Date(endMs).toISOString()));
  const recovery: Record<string, DriverRecovery> = {};
  for (const u of [...new Set(util.map((x: any) => x.driver_id as string))]) {
    const mine = util.filter((x: any) => x.driver_id === u);
    const a = aggregateUtilization(mine);
    recovery[u] = { pct: a.utilization_pct == null ? null : a.utilization_pct / 100, loads: a.eligible_loads, under: mine.filter((x: any) => x.eligibility === "eligible" && Number(x.unused_gallons ?? 0) > 0).length, flagged: a.excluded_incomplete_data };
  }
  const all = aggregateUtilization(util);

  const prior = await priorWeeks(admin, companyId, weekStart);
  return buildRecap({ companyName: (co as { company_name?: string } | null)?.company_name ?? "Company", weekStart, weekEnd, tz, standardsVersion: version, settings, drivers, scores, trips: weekTrips, recovery, regionRecovery: { pct: all.utilization_pct == null ? null : all.utilization_pct / 100, loads: all.eligible_loads }, prior, generatedAt: nowIso });
}

async function priorWeeks(admin: SupabaseClient, companyId: string, weekStart: string): Promise<PriorRecap | null> {
  const list = await rows<{ week_start: string; report: Recap }>(admin.from("weekly_recaps").select("week_start, report").eq("company_id", companyId).lt("week_start", weekStart).order("week_start", { ascending: false }).limit(4));
  if (!list.length) return null;
  const last = list[0].report;
  const tile = (r: Recap, label: string) => { const v = r.tiles.find((t) => t.label === label)?.value ?? ""; const n = parseFloat(v.replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
  const driverAtr: Record<string, number[]> = {};
  for (const w of list) for (const d of w.report.drivers) if (d.atr != null && !d.insufficient) (driverAtr[d.userId] ??= []).push(d.atr);
  return {
    atrMedian: tile(last, "Region ATR"), recoveryPct: tile(last, "Recovery %"), loadedShare: tile(last, "Loaded share"),
    loads: tile(last, "Loads delivered") ?? 0, gallons: tile(last, "Gallons delivered") ?? 0,
    placeLost: Object.fromEntries(last.ledger.places.map((p) => [p.key, p.lostMin])), driverAtr,
  };
}

/** Builds and stores a week's recap (replacing a stored one when it is regenerated). */
export async function generateWeeklyRecap(admin: SupabaseClient, companyId: string, weekStart: string, by: string | null): Promise<Recap> {
  const report = await buildWeeklyRecap(admin, companyId, weekStart);
  const s = await loadSettings(admin, companyId);
  const { data: had } = await admin.from("weekly_recaps").select("week_start").eq("company_id", companyId).eq("week_start", weekStart).maybeSingle();
  await admin.from("weekly_recaps").upsert({ company_id: companyId, week_start: weekStart, standards_version: report.standardsVersion, settings_version: s.version, generated_at: new Date().toISOString(), generated_by: by, regenerated_at: had ? new Date().toISOString() : null, report });
  return report;
}

export async function recapPdf(r: Recap): Promise<Uint8Array> {
  const d = await PdfDoc.create();
  drawRecap(d, r);
  return d.save();
}

export async function emailRecap(r: Recap, to: string[]): Promise<void> {
  const pdf = await recapPdf(r);
  const label = `${r.weekStart} to ${r.weekEnd}`;
  await email(to, `Weekly Recap ${label} - ${r.companyName}`, `Weekly Recap for ${label}. Confidential - internal. How each driver used the week's time, and where the delays came from.`, `WeeklyRecap-${r.weekStart}.pdf`, pdf);
}

/** Cron: every enabled company whose Monday send time has passed and that has not had last week's recap yet. */
export async function runWeeklyRecaps(now = Date.now()): Promise<{ checked: number; sent: number }> {
  const { getServiceSupabase } = await import("@/lib/supabase/serviceClient");
  const admin = getServiceSupabase();
  const list = await rows<RecapSettingsRow>(admin.from("weekly_recap_settings").select("*").eq("enabled", true));
  let sent = 0;
  for (const s of list) {
    const today = localDateOf(now, s.tz);
    const thisMonday = mondayOf(today), lastMonday = addDays(thisMonday, -7);
    const [hh, mm] = s.send_at.split(":").map(Number);
    const due = localMidnightMs(thisMonday, s.tz) + ((hh || 0) * 60 + (mm || 0)) * 60_000;
    if (now < due || (s.last_for_week && s.last_for_week >= lastMonday)) continue;
    await admin.from("weekly_recap_settings").update({ last_for_week: lastMonday }).eq("company_id", s.company_id); // marked first: a crash can't send it twice
    try {
      const r = await generateWeeklyRecap(admin, s.company_id, lastMonday, null);
      if (s.recipients.length) { await emailRecap(r, s.recipients); sent++; }
    } catch (e) { await admin.from("app_errors").insert({ company_id: s.company_id, kind: "send_failed", message: `Weekly Recap failed: ${(e as Error).message}`, payload: { week: lastMonday } }); }
  }
  return { checked: list.length, sent };
}
