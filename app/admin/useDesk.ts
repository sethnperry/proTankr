"use client";
// app/admin/useDesk.ts
//
// The Desk's data: open entries from the error log (one company, or every company for a super admin), the people
// behind them, and a driver's timeline on request. Polls every minute. Resolving and retrying write back here.
// Every read fails open. The rules are in lib/desk/desk.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { deviceTz } from "@/lib/reports/dateRange";
import { timeline, type ErrorRow, type Retry, type TimelineEntry } from "@/lib/desk/desk";

const POLL_MS = 60_000;
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export type Person = { name: string; region: string | null };

export function useDesk(o: { companyId: string | null; allCompanies: boolean; enabled: boolean }) {
  const { companyId, allCompanies, enabled } = o;
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [companies, setCompanies] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!enabled || (!allCompanies && !companyId)) return;
    setLoading(true);
    try {
      let q = supabase.from("app_errors").select("*").is("resolved_at", null).order("created_at", { ascending: false }).limit(400);
      if (!allCompanies) q = q.eq("company_id", companyId as string);
      const { data, error: e } = await q;
      if (e) throw e;
      const list = (data ?? []) as ErrorRow[];
      const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean) as string[])];
      const map = new Map<string, Person>();
      for (const part of chunk(ids, 150)) {
        const { data: nm } = await supabase.rpc("get_display_names_full", { p_user_ids: part });
        for (const r of (nm ?? []) as any[]) map.set(r.user_id, { name: r.display_name ?? "Driver", region: r.region ?? null });
      }
      if (allCompanies) {
        const cids = [...new Set(list.map((r) => r.company_id).filter(Boolean) as string[])];
        const { data: cs } = cids.length ? await supabase.from("companies").select("company_id, company_name").in("company_id", cids) : { data: [] };
        if (alive.current) setCompanies(new Map(((cs ?? []) as any[]).map((c) => [c.company_id, c.company_name ?? "Company"])));
      }
      if (!alive.current) return;
      setRows(list); setPeople(map); setError(null);
    } catch (e: any) { if (alive.current) setError(e?.message ?? "Couldn't load the Desk."); }
    if (alive.current) setLoading(false);
  }, [enabled, allCompanies, companyId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, load]);

  const resolve = useCallback(async (ids: string[]): Promise<string | null> => {
    if (!ids.length) return null;
    const { data: u } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("app_errors").update({ resolved_at: new Date().toISOString(), resolved_by: u.user?.id ?? null }).in("error_id", ids);
    if (e) return e.message;
    setRows((rs) => rs.filter((r) => !ids.includes(r.error_id)));
    return null;
  }, []);

  /** Pushes a "send your saved work" request to the driver's phone. The entry clears itself when the phone has sent it. */
  const nudgeSync = useCallback(async (userId: string): Promise<string | null> => {
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch("/api/desk/nudge-sync", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ userId }) });
    const j = (await res.json().catch(() => ({}))) as { sent?: number; error?: string };
    if (!res.ok) return j.error ?? "Couldn't reach the phone.";
    return j.sent ? "Asked the phone to sync. This clears here once it has sent everything." : "That phone has notifications off, so it can't be reached. Ask the driver to open the app with signal.";
  }, []);

  /** Sends a call-out email again. Resolves the entry when it went. */
  const retry = useCallback(async (errorId: string, r: Retry): Promise<string | null> => {
    if (r.type === "sync") return nudgeSync(r.userId);
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch("/api/callouts", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ calloutId: r.calloutId, event: r.event, tz: deviceTz() }) });
    const j = (await res.json().catch(() => ({}))) as { sent?: boolean; reason?: string; error?: string };
    if (!res.ok) return j.error ?? "Couldn't send.";
    if (!j.sent) return j.reason === "no_recipients" ? "Still no call-out email is set up for this. Add one in Call-out routing." : "The call-out hasn't reached the server yet.";
    return resolve([errorId]);
  }, [resolve]);

  const loadTimeline = useCallback(async (userId: string): Promise<TimelineEntry[]> => {
    const since = new Date(Date.now() - 14 * 86400_000).toISOString();
    const q = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> => { try { const r = await p; return (r.error ? [] : r.data ?? []) as T; } catch { return [] as unknown as T; } };
    const [trips, shifts, captures, insp, calls, work, checks, freight] = await Promise.all([
      q<any[]>(supabase.from("trips").select("trip_id, status, started_at, completed_at").eq("driver_id", userId).gte("started_at", since).order("started_at", { ascending: false }).limit(60)),
      q<any[]>(supabase.from("shift_events").select("event_id, event_type, occurred_at, source").eq("user_id", userId).gte("occurred_at", since).limit(300)),
      q<any[]>(supabase.from("form_captures").select("capture_id, purpose, created_at, source").eq("user_id", userId).gte("created_at", since).limit(200)),
      q<any[]>(supabase.from("unit_inspections").select("inspection_id, unit_kind, overall, created_at").eq("driver_id", userId).gte("created_at", since).limit(100)),
      q<any[]>(supabase.from("callouts").select("callout_id, shift_date, status, reason, created_at, updated_at").eq("user_id", userId).gte("created_at", since).limit(60)),
      q<any[]>(supabase.from("terminal_work").select("work_id, activity, terminal_name, started_at, source").eq("user_id", userId).gte("started_at", since).limit(100)),
      q<any[]>(supabase.from("tank_checks").select("check_id, location_name, read_at, source, delivery_id").eq("user_id", userId).gte("read_at", since).limit(100)),
      q<any[]>(supabase.from("freight_loads").select("freight_id, preset, reference, route_number, begun_at, source").eq("driver_id", userId).gte("begun_at", since).limit(60)),
    ]);
    const orders = new Map<string, string>();
    for (const part of chunk(trips.map((t) => t.trip_id as string), 150)) {
      const rows = await q<any[]>(supabase.from("trip_orders").select("trip_id, order_number, is_primary").in("trip_id", part));
      for (const r of rows) if (r.is_primary || !orders.has(r.trip_id)) orders.set(r.trip_id, r.order_number ?? "");
    }
    return timeline({
      trips: trips.map((t) => ({ ...t, order: orders.get(t.trip_id) || null })),
      shifts, captures,
      forms: [
        ...insp.map((i) => ({ key: `i|${i.inspection_id}`, at: i.created_at, title: `${i.unit_kind === "truck" ? "Truck" : "Trailer"} inspection`, detail: i.overall ?? "" })),
        ...calls.map((c) => ({ key: `co|${c.callout_id}`, at: c.created_at, title: c.status === "withdrawn" ? "Call-out withdrawn" : "Call-out", detail: `${c.shift_date} · ${c.reason ?? ""}` })),
        ...work.map((w) => ({ key: `w|${w.work_id}`, at: w.started_at, title: "Terminal work", detail: `${String(w.activity).replace(/_/g, " ")}${w.terminal_name ? ` · ${w.terminal_name}` : ""}`, source: w.source })),
        ...checks.map((c) => ({ key: `tc|${c.check_id}`, at: c.read_at, title: c.delivery_id ? "Meter ticket" : "Tank check", detail: c.location_name ?? "", source: c.source })),
        ...freight.map((f) => ({ key: `f|${f.freight_id}`, at: f.begun_at, title: "Freight load", detail: f.preset === "lts" ? `LTS route ${f.route_number ?? ""}` : f.reference ?? "", source: f.source })),
      ],
    });
  }, []);

  return { rows, people, companies, loading, error, resolve, retry, nudgeSync, loadTimeline, reload: load };
}
