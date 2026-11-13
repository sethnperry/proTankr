// lib/eod/eodServer.ts
//
// Builds one company's End of Day report for one local day and emails it. Server only (service client).
// Who is in: drivers who ended their shift on that day before midnight, in the regions the admin chose.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PdfDoc, M, W, MUTE, INK } from "../pdf/doc.ts";
import { drawPtd } from "../trips/ptdPdf.ts";
import { loadPtdBundle } from "../trips/packageServer.ts";
import { addDays, localDateOf, localMidnightMs } from "../worklog/time.ts";
import { buildEod, eodShifts, hm, hours1, type EodDriver, type EodTrip, type Span } from "./eod.ts";
import type { ShiftEventRow } from "../trips/types.ts";

export type EodSettings = { company_id: string; enabled: boolean; regions: string[]; recipients: string[]; send_at: string; tz: string; last_for_date: string | null };

const rows = async <T>(p: PromiseLike<{ data: unknown }>): Promise<T[]> => ((await p).data ?? []) as T[];
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function buildEodPdf(admin: SupabaseClient, s: Pick<EodSettings, "company_id" | "regions" | "tz">, forDate: string): Promise<{ pdf: Uint8Array; drivers: number; loads: number } | null> {
  const dayStart = localMidnightMs(forDate, s.tz), dayEnd = localMidnightMs(addDays(forDate, 1), s.tz);
  const members = await rows<{ user_id: string }>(admin.from("user_companies").select("user_id").eq("company_id", s.company_id));
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return null;
  const profs = await rows<{ user_id: string; display_name: string | null; region: string | null; local_area: string | null }>(admin.from("profiles").select("user_id, display_name, region, local_area").in("user_id", ids));
  const want = new Set(s.regions.map(norm).filter(Boolean));
  const drivers: EodDriver[] = profs.filter((p) => !want.size || want.has(norm(p.region))).map((p) => ({ userId: p.user_id, name: p.display_name || "Driver", region: p.region, area: p.local_area }));
  if (!drivers.length) return null;
  const dIds = drivers.map((d) => d.userId);

  const events = await rows<ShiftEventRow>(admin.from("shift_events").select("*").eq("company_id", s.company_id).in("user_id", dIds).gte("occurred_at", new Date(dayStart - 36 * 3600_000).toISOString()).lte("occurred_at", new Date(dayEnd + 6 * 3600_000).toISOString()).order("occurred_at").limit(10000));
  const shifts = eodShifts(events, dIds, dayStart, dayEnd, new Date().toISOString());
  if (!shifts.length) return null;
  const shiftIds = [...new Set(shifts.map((x) => x.userId))];
  const lo = Math.min(...shifts.map((x) => Date.parse(x.startedAt))), hi = Math.max(...shifts.map((x) => Date.parse(x.endedAt!)));

  const tripRows = await rows<{ trip_id: string; driver_id: string; started_at: string | null; completed_at: string | null }>(
    admin.from("trips").select("trip_id, driver_id, started_at, completed_at").in("driver_id", shiftIds).eq("status", "complete").gte("completed_at", new Date(lo).toISOString()).lte("completed_at", new Date(hi).toISOString()));
  const inShift = (t: { driver_id: string; completed_at: string | null }) => shifts.some((x) => x.userId === t.driver_id && t.completed_at && t.completed_at >= x.startedAt && t.completed_at <= x.endedAt!);
  const mine = tripRows.filter(inShift);

  const nameOf = new Map(drivers.map((d) => [d.userId, d]));
  const trips: EodTrip[] = [];
  const bundles: { userId: string; startedAt: string | null; bundle: NonNullable<Awaited<ReturnType<typeof loadPtdBundle>>> }[] = [];
  for (const t of mine) {
    const b = await loadPtdBundle(admin, t.trip_id);
    if (!b) continue;
    bundles.push({ userId: t.driver_id, startedAt: t.started_at, bundle: b });
    trips.push({ tripId: t.trip_id, userId: t.driver_id, truck: b.truckName, trailer: b.trailerName, startedAt: t.started_at, completedAt: t.completed_at, ...b.eod });
  }

  const other: Span[] = [];
  for (const m of await rows<{ driver_id: string; started_at: string; ended_at: string | null }>(admin.from("empty_moves").select("driver_id, started_at, ended_at").in("driver_id", shiftIds).gte("started_at", new Date(lo).toISOString()).lte("started_at", new Date(hi).toISOString()))) if (m.ended_at) other.push({ userId: m.driver_id, from: m.started_at, to: m.ended_at });
  for (const f of await rows<{ driver_id: string; started_at: string; finished_at: string | null }>(admin.from("fuel_purchases").select("driver_id, started_at, finished_at").in("driver_id", shiftIds).gte("started_at", new Date(lo).toISOString()).lte("started_at", new Date(hi).toISOString()))) if (f.finished_at) other.push({ userId: f.driver_id, from: f.started_at, to: f.finished_at });

  const { groups, summary } = buildEod({ drivers, shifts, trips, other });
  const { data: co } = await admin.from("companies").select("company_name").eq("company_id", s.company_id).maybeSingle();

  const d = await PdfDoc.create();
  const dayLabel = new Date(`${forDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  d.title("End of Day", dayLabel);
  d.kv("Company:", (co as { company_name?: string } | null)?.company_name ?? "-");
  d.kv("Regions:", s.regions.length ? s.regions.join(", ") : "All");
  d.kv("Drivers:", `${shiftIds.length} ended their day before midnight`);
  for (const g of groups) {
    d.heading(g.title);
    for (const r of g.rows) for (const ln of r.lines) d.para(ln, 9, d.reg, INK);
  }
  d.heading("Summary");
  d.kv("Loads:", String(summary.loads));
  if (summary.byProduct.length) d.table(["Product", "Loads", "Gallons"], summary.byProduct.map((p) => [p.name, String(p.loads), Math.round(p.gallons).toLocaleString("en-US")]), [0.6, 0.15, 0.25], ["l", "r", "r"]);
  d.gap(6);
  d.kv("Man hours:", `${hours1(summary.manMinutes)} h (${hm(summary.manMinutes)})`);
  d.kv("Grey zone hours:", `${hours1(summary.greyMinutes)} h (${hm(summary.greyMinutes)}) of shift time no trip, empty move or fuel stop accounts for`);
  d.gap(4);
  d.table(["Driver", "Shift", "Loads", "Grey zone"], summary.perDriver.map((x) => [x.name, hm(x.shiftMinutes), String(x.loads), hm(x.greyMinutes)]), [0.4, 0.2, 0.15, 0.25], ["l", "r", "r", "r"]);

  // Each driver's PTDs, by area then driver, in trip order.
  const order = new Map(groups.flatMap((g, gi) => g.rows.map((r, ri) => [r.driver, gi * 1000 + ri] as const)));
  bundles.sort((a, b) => (order.get(nameOf.get(a.userId)?.name ?? "") ?? 0) - (order.get(nameOf.get(b.userId)?.name ?? "") ?? 0) || String(a.startedAt).localeCompare(String(b.startedAt)));
  for (const b of bundles) { d.newPage(); drawPtd(d, b.bundle.ptd, { truckName: b.bundle.truckName, trailerName: b.bundle.trailerName, driverName: b.bundle.driverName, tz: s.tz }); }
  d.footer(`ProTankr End of Day ${forDate}`);
  void M; void W; void MUTE;
  return { pdf: await d.save(), drivers: shiftIds.length, loads: trips.length };
}

async function email(to: string[], subject: string, text: string, filename: string, pdf: Uint8Array) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set.");
  const from = process.env.INVITE_FROM_EMAIL ?? "noreply@protankr.com";
  for (const addr of to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: `ProTankr <${from}>`, to: [addr], subject, text, html: `<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111111">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`, attachments: [{ filename, content: Buffer.from(pdf).toString("base64") }] }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}

/** Builds and emails the report for a company and date. Returns what was sent (or why nothing was). */
export async function sendEod(admin: SupabaseClient, s: EodSettings, forDate: string): Promise<{ sent: boolean; reason?: string; drivers?: number; loads?: number }> {
  if (!s.recipients.length) return { sent: false, reason: "No recipients set." };
  const r = await buildEodPdf(admin, s, forDate);
  if (!r) return { sent: false, reason: "No drivers ended their day before midnight." };
  await email(s.recipients, `End of Day ${forDate} - ${r.loads} load${r.loads === 1 ? "" : "s"}, ${r.drivers} driver${r.drivers === 1 ? "" : "s"}`,
    `End of Day report for ${forDate}: ${r.loads} load${r.loads === 1 ? "" : "s"} by ${r.drivers} driver${r.drivers === 1 ? "" : "s"} who ended their day before midnight. The cover has the highlights; each driver's PTDs follow.`,
    `EndOfDay-${forDate}.pdf`, r.pdf);
  return { sent: true, drivers: r.drivers, loads: r.loads };
}

/** Cron: every enabled company whose send time has passed and that hasn't had yesterday's report yet. */
export async function runEodReports(now = Date.now()): Promise<{ checked: number; sent: number }> {
  const { getServiceSupabase } = await import("@/lib/supabase/serviceClient");
  const admin = getServiceSupabase();
  const list = await rows<EodSettings>(admin.from("eod_report_settings").select("*").eq("enabled", true));
  let sent = 0;
  for (const s of list) {
    const today = localDateOf(now, s.tz), yesterday = addDays(today, -1);
    const [hh, mm] = s.send_at.split(":").map(Number);
    const due = localMidnightMs(today, s.tz) + ((hh || 0) * 60 + (mm || 0)) * 60_000;
    if (now < due || (s.last_for_date && s.last_for_date >= yesterday)) continue;
    // Marked first, so a crash mid-send can't send it twice on the next tick.
    await admin.from("eod_report_settings").update({ last_for_date: yesterday }).eq("company_id", s.company_id);
    try { if ((await sendEod(admin, s, yesterday)).sent) sent++; }
    catch (e) { await admin.from("app_errors").insert({ company_id: s.company_id, kind: "send_failed", message: `End of Day report failed: ${(e as Error).message}`, payload: { date: yesterday } }); }
  }
  return { checked: list.length, sent };
}
