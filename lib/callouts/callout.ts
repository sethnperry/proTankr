// lib/callouts/callout.ts
//
// Call-outs, the rules only: what a call-out needs, when a driver may still withdraw it, who gets the email (by
// region, local area and division, most specific first, company default last), when an active call-out blocks
// the dispatch board, and what the emails say. Pure: no Supabase, no network.

import { newId, type TripStore } from "../trips/tripStore.ts";
import type { CalloutRow } from "../trips/types.ts";
import { addDays, localDateOf, localMidnightMs } from "../worklog/time.ts";

export type { CalloutRow };

export type RouteKind = "dispatch" | "manager";
export type CalloutRoute = { route_id: string; kind: RouteKind; email: string; region: string | null; local_area: string | null; division: string | null };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** The moment a shift starts: a local date and "HH:MM" in the driver's time zone. */
export function shiftStartAt(date: string, hhmm: string, tz: string): string {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  return new Date(localMidnightMs(date, tz) + ((h || 0) * 60 + (m || 0)) * 60_000).toISOString();
}

export type CalloutInput = { reason: string; reasonId: string | null; note: string; date: string; time: string };

export function calloutProblem(i: CalloutInput): string | null {
  if (!i.reason.trim()) return "Pick a reason.";
  if (i.reasonId == null && !i.note.trim()) return "Say what the reason is.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return "Pick the day of the shift.";
  if (!/^\d{1,2}:\d{2}$/.test(i.time)) return "Enter when the shift starts.";
  return null;
}

/** A driver may withdraw (or change) their own call-out until the shift starts; staff any time. */
export const canWithdraw = (c: Pick<CalloutRow, "status" | "shift_start_at">, nowMs: number, isStaff: boolean) =>
  c.status === "active" && (isStaff || Date.parse(c.shift_start_at) > nowMs);

export function createCallout(store: TripStore, o: {
  companyId: string; driverId: string; actorId: string; input: CalloutInput; category: string | null; division: string | null;
  region: string | null; localArea: string | null; tz: string; id?: string;
}): CalloutRow {
  const id = o.id ?? newId();
  const existing = store.get("callouts", id);
  if (existing) return existing;
  const row: CalloutRow = {
    callout_id: id, company_id: o.companyId, user_id: o.driverId, shift_date: o.input.date, shift_start_at: shiftStartAt(o.input.date, o.input.time, o.tz),
    reason: o.input.reason.trim(), reason_id: o.input.reasonId && !o.input.reasonId.startsWith("default-") ? o.input.reasonId : null, category: o.category,
    note: o.input.note.trim() || null, division: o.division, region: o.region, local_area: o.localArea,
    status: "active", created_by: o.actorId, updated_by: null, withdrawn_by: null, withdrawn_at: null,
  };
  store.put("callouts", row);
  return row;
}

export function withdrawCallout(store: TripStore, id: string, actorId: string, nowIso: string): CalloutRow | null {
  const c = store.get("callouts", id);
  if (!c || c.status === "withdrawn") return c ?? null;
  const next: CalloutRow = { ...c, status: "withdrawn", withdrawn_by: actorId, withdrawn_at: nowIso, updated_by: actorId };
  store.put("callouts", next);
  return next;
}

export function editCallout(store: TripStore, id: string, actorId: string, input: CalloutInput, category: string | null, tz: string): CalloutRow | null {
  const c = store.get("callouts", id);
  if (!c || c.status !== "active") return null;
  const next: CalloutRow = {
    ...c, reason: input.reason.trim(), reason_id: input.reasonId && !input.reasonId.startsWith("default-") ? input.reasonId : null, category,
    note: input.note.trim() || null, shift_date: input.date, shift_start_at: shiftStartAt(input.date, input.time, tz), updated_by: actorId,
  };
  store.put("callouts", next);
  return next;
}

// ── Who gets the email ───────────────────────────────────────────────────────────────────────────────────────
export type RouteContext = { region: string | null; localArea: string | null; division: string | null };

/**
 * For each kind, the routes that match the driver and are the most specific. A route matches when every field it
 * sets equals the driver's (case-insensitive); a route that sets nothing is the company default. The best tier wins.
 */
export function resolveRoutes(routes: CalloutRoute[], ctx: RouteContext): { dispatch: string[]; manager: string[] } {
  const out = { dispatch: [] as string[], manager: [] as string[] };
  for (const kind of ["dispatch", "manager"] as const) {
    const matching = routes.filter((r) => r.kind === kind
      && (!r.region || norm(r.region) === norm(ctx.region))
      && (!r.local_area || norm(r.local_area) === norm(ctx.localArea))
      && (!r.division || norm(r.division) === norm(ctx.division)));
    const score = (r: CalloutRoute) => Number(!!r.region) + Number(!!r.local_area) + Number(!!r.division);
    const best = matching.reduce((m, r) => Math.max(m, score(r)), -1);
    const seen = new Set<string>();
    for (const r of matching.filter((x) => score(x) === best)) {
      const k = norm(r.email);
      if (!seen.has(k)) { seen.add(k); out[kind].push(r.email.trim()); }
    }
  }
  return out;
}

export const routeLabel = (r: Pick<CalloutRoute, "region" | "local_area" | "division">) =>
  [r.region, r.local_area, r.division].filter(Boolean).join(" · ") || "Company default";

export function routeProblem(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter a valid email address.";
}

// ── The dispatch board ───────────────────────────────────────────────────────────────────────────────────────
/** The active call-out that covers this driver on the day a load would start, if any. */
export function calloutBlock(callouts: CalloutRow[], driverId: string, startMs: number, tz: string): CalloutRow | null {
  const day = localDateOf(startMs, tz);
  return callouts.find((c) => c.status === "active" && c.user_id === driverId && c.shift_date === day) ?? null;
}

export const blockText = (c: CalloutRow, driverName: string) =>
  `${driverName} called out for ${mdy(c.shift_date)} (${c.reason}). Correct the call-out first: withdraw it if they're coming in, or change it.`;

const mdy = (d: string) => { const [, m, dd] = d.split("-"); return `${Number(m)}/${Number(dd)}`; };
const hhmm = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

export type CalloutEvent = "created" | "edited" | "withdrawn";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildCalloutEmail(o: { event: CalloutEvent; callout: CalloutRow; driverName: string; actorName: string; byDispatch: boolean; tz: string }): { subject: string; html: string; text: string } {
  const c = o.callout;
  const when = `${mdy(c.shift_date)} ${hhmm(c.shift_start_at, o.tz)}`;
  const verb = o.event === "created" ? "Call-out" : o.event === "edited" ? "Call-out corrected" : o.byDispatch ? "Call-out corrected: withdrawn" : "Call-out withdrawn";
  const subject = `${verb}: ${o.driverName}, ${when}`;
  const rows: [string, string][] = [
    ["Driver", o.driverName],
    ["Shift", when],
    ["Reason", c.reason + (c.note ? `: ${c.note}` : "")],
    ...(c.division ? ([["Division", c.division]] as [string, string][]) : []),
    ...([c.region, c.local_area].filter(Boolean).length ? ([["Where", [c.region, c.local_area].filter(Boolean).join(" · ")]] as [string, string][]) : []),
    ...(o.byDispatch ? ([["Entered by", `${o.actorName} (dispatch)`]] as [string, string][]) : []),
  ];
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111"><p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#666;margin:0 0 8px">ProTankr</p><h2 style="margin:0 0 14px">${esc(subject)}</h2><table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#666;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}</table></div>`;
  return { subject, html, text: `${subject}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}` };
}

// ── Lists ───────────────────────────────────────────────────────────────────────────────────────────────────
export type CalloutGroup = { upcoming: CalloutRow[]; past: CalloutRow[] };
/** Active call-outs for today or later first (soonest first), everything else after (newest first). */
export function groupCallouts(rows: CalloutRow[], nowMs: number, tz: string): CalloutGroup {
  const today = localDateOf(nowMs, tz);
  const upcoming = rows.filter((c) => c.status === "active" && c.shift_date >= addDays(today, 0)).sort((a, b) => a.shift_start_at.localeCompare(b.shift_start_at));
  const ids = new Set(upcoming.map((c) => c.callout_id));
  const past = rows.filter((c) => !ids.has(c.callout_id)).sort((a, b) => b.shift_start_at.localeCompare(a.shift_start_at));
  return { upcoming, past };
}
