// lib/desk/desk.ts
//
// The Desk, the rules only: the error inbox grouped by kind and driver, which entries can be retried, the stuck-sync
// list, a driver's timeline, and who may do what. Pure: no Supabase, no React, no clock.

import type { AppErrorKind } from "../errors/appErrors.ts";

export type ErrorRow = { error_id: string; company_id: string | null; user_id: string | null; kind: AppErrorKind; message: string; payload: Record<string, unknown>; created_at: string; resolved_at: string | null };

export const KIND_LABEL: Record<AppErrorKind, string> = {
  send_failed: "Email or push failed",
  sync_stuck: "Phone can't sync",
  telematics_link: "Geotab link broken",
  geotab_mismatch: "Geotab doesn't match",
  other: "Other",
};
const KIND_ORDER: AppErrorKind[] = ["send_failed", "sync_stuck", "telematics_link", "geotab_mismatch", "other"];

export function ageText(createdIso: string, nowMs: number): string {
  const m = Math.max(0, Math.round((nowMs - Date.parse(createdIso)) / 60_000));
  if (!Number.isFinite(m)) return "";
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

// ── Who may do what ────────────────────────────────────────────────────────────────────────────────────────
export type DeskScope = { allCompanies: boolean; ownRegionOnly: boolean; canResolve: boolean; canUseAs: boolean };
/** Admin: their own company, full. Super admin: every company. Dispatch: their own region, read only. Anyone else: nothing. */
export function deskScope(role: string | null, isSuperAdmin: boolean): DeskScope | null {
  if (isSuperAdmin) return { allCompanies: true, ownRegionOnly: false, canResolve: true, canUseAs: true };
  if (role === "admin" || role === "owner") return { allCompanies: false, ownRegionOnly: false, canResolve: true, canUseAs: true };
  if (role === "dispatch") return { allCompanies: false, ownRegionOnly: true, canResolve: false, canUseAs: false };
  return null;
}

const norm = (r: string | null | undefined) => (r ?? "").trim().toLowerCase();
/** Dispatch sees errors of drivers in their own region (an entry with no driver is company-level and not theirs). */
export function visibleErrors(rows: ErrorRow[], scope: DeskScope, myRegion: string | null, regionOf: (userId: string) => string | null | undefined): ErrorRow[] {
  if (!scope.ownRegionOnly) return rows;
  const mine = norm(myRegion);
  return mine ? rows.filter((r) => r.user_id && norm(regionOf(r.user_id)) === mine) : [];
}

// ── The inbox ──────────────────────────────────────────────────────────────────────────────────────────────
export type Retry = { type: "callout"; calloutId: string; event: "created" | "edited" | "withdrawn" };
/** Only some failures can be sent again from here: a call-out email. */
export function retryTarget(r: Pick<ErrorRow, "kind" | "payload">): Retry | null {
  const id = r.payload?.callout_id;
  if (r.kind !== "send_failed" || typeof id !== "string") return null;
  const ev = r.payload?.event;
  return { type: "callout", calloutId: id, event: ev === "edited" || ev === "withdrawn" ? ev : "created" };
}

export type InboxItem = { id: string; message: string; age: string; createdAt: string; retry: Retry | null; companyId: string | null };
export type InboxDriver = { userId: string | null; name: string; items: InboxItem[] };
export type InboxGroup = { kind: AppErrorKind; label: string; count: number; drivers: InboxDriver[] };

/** Open entries grouped by kind, then by driver, newest first at every level. */
export function groupErrors(rows: ErrorRow[], nameOf: (userId: string) => string, nowMs: number): InboxGroup[] {
  const open = rows.filter((r) => !r.resolved_at).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups: InboxGroup[] = [];
  for (const kind of KIND_ORDER) {
    const ofKind = open.filter((r) => r.kind === kind);
    if (!ofKind.length) continue;
    const byDriver = new Map<string, InboxDriver>();
    for (const r of ofKind) {
      const key = r.user_id ?? "";
      const d = byDriver.get(key) ?? { userId: r.user_id, name: r.user_id ? nameOf(r.user_id) : "Company", items: [] };
      d.items.push({ id: r.error_id, message: r.message, age: ageText(r.created_at, nowMs), createdAt: r.created_at, retry: retryTarget(r), companyId: r.company_id });
      byDriver.set(key, d);
    }
    groups.push({ kind, label: KIND_LABEL[kind], count: ofKind.length, drivers: [...byDriver.values()] });
  }
  // The kind with the newest entry first.
  return groups.sort((a, b) => b.drivers[0].items[0].createdAt.localeCompare(a.drivers[0].items[0].createdAt));
}
export const openCount = (rows: ErrorRow[]) => rows.filter((r) => !r.resolved_at).length;

// ── Stuck syncs ────────────────────────────────────────────────────────────────────────────────────────────
export type StuckRow = { userId: string; name: string; count: number; failed: number; tables: string[]; oldestAge: string; lastError: string | null; errorId: string };
/** The newest open "phone can't sync" report for each driver. */
export function stuckList(rows: ErrorRow[], nameOf: (userId: string) => string, nowMs: number): StuckRow[] {
  const latest = new Map<string, ErrorRow>();
  for (const r of rows) {
    if (r.kind !== "sync_stuck" || r.resolved_at || !r.user_id) continue;
    const cur = latest.get(r.user_id);
    if (!cur || r.created_at > cur.created_at) latest.set(r.user_id, r);
  }
  return [...latest.values()].map((r) => {
    const p = r.payload as { count?: number; failed?: number; tables?: string[]; oldestAt?: string | null; lastError?: string | null };
    return { userId: r.user_id as string, name: nameOf(r.user_id as string), count: Number(p.count) || 0, failed: Number(p.failed) || 0, tables: Array.isArray(p.tables) ? p.tables : [], oldestAge: p.oldestAt ? ageText(p.oldestAt, nowMs) : ageText(r.created_at, nowMs), lastError: p.lastError ?? null, errorId: r.error_id };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── A driver's timeline ────────────────────────────────────────────────────────────────────────────────────
export type Source = "geotab" | "app" | "manual";
export type TimelineEntry = { key: string; at: string; kind: "trip" | "shift" | "form"; title: string; detail: string; source: Source };
const src = (s: unknown): Source => (s === "geotab" || s === "manual" ? s : "app");
const SHIFT_LABEL: Record<string, string> = { shift_start: "Shift started", shift_end: "Shift ended", shift_explanation: "Shift explained", shift_idle_response: "Still working", safety_meeting: "Safety meeting signed", callout: "Call-out", document: "Document dropped", down_time: "Down time", paper_log: "Paper log" };
const FORM_LABEL: Record<string, string> = { fuel_receipt: "Fuel receipt", scale_ticket: "Scale ticket", tank_ticket: "Tank ticket", document: "Document", down_time: "Down time", paper_log: "Paper log", inspection: "Inspection", manifest: "Manifest" };

export function timeline(i: {
  trips: { trip_id: string; status: string; started_at: string | null; completed_at: string | null; order?: string | null }[];
  shifts: { event_id: string; event_type: string; occurred_at: string; source: unknown }[];
  captures: { capture_id: string; purpose: string; created_at: string; source: unknown }[];
  forms?: { key: string; at: string; title: string; detail?: string; source?: unknown }[];
}): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const t of i.trips) {
    if (t.started_at) out.push({ key: `t|${t.trip_id}|s`, at: t.started_at, kind: "trip", title: "Trip began", detail: t.order ? `Order ${t.order}` : "", source: "app" });
    if (t.completed_at) out.push({ key: `t|${t.trip_id}|c`, at: t.completed_at, kind: "trip", title: t.status === "cancelled" ? "Trip cancelled" : "Trip complete", detail: t.order ? `Order ${t.order}` : "", source: "app" });
  }
  for (const s of i.shifts) out.push({ key: `s|${s.event_id}`, at: s.occurred_at, kind: "shift", title: SHIFT_LABEL[s.event_type] ?? s.event_type.replace(/_/g, " "), detail: "", source: src(s.source) });
  for (const c of i.captures) out.push({ key: `c|${c.capture_id}`, at: c.created_at, kind: "form", title: FORM_LABEL[c.purpose] ?? c.purpose, detail: "photo", source: src(c.source) });
  for (const f of i.forms ?? []) out.push({ key: f.key, at: f.at, kind: "form", title: f.title, detail: f.detail ?? "", source: src(f.source) });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
