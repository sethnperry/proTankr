"use client";
// lib/dispatch/useDispatchData.ts
//
// Data for the Dispatch Dashboard's two modes. Both read straight from the
// server and fail open (an error leaves the lists empty and is reported).
//
//   useFleetReports  LIVE: active terminal reports at every terminal a
//                    company truck is headed to, plus what each planned
//                    load is carrying (for matching product reports).
//   usePlanData      PLAN: the roster's terminal access, credentials and
//                    badges, the company's equipment permits and service,
//                    and 90 days of loads (for access gaps).
//   useConflictAcks  LIVE: who marked which conflict handled, and why.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { activePickup } from "@/lib/trips/tripFlow";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import { mostRecentClearingCheckpoint } from "@/app/planner/utils/dates";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import type { ActiveReport, ReportType } from "./conflicts";
import type { PlanInputs } from "./planAlerts";
import { OFTEN_WINDOW_DAYS } from "./planAlerts";
import { serviceAlerts } from "./serviceAlerts";
import type { Ack } from "./acks";

const POLL_MS = 60_000;

function usePoll(fn: () => Promise<void>, deps: unknown[]) {
  useEffect(() => {
    void fn();
    const id = window.setInterval(() => void fn(), POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") void fn(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function useFleetReports(trips: FleetTrip[], watchTerminalIds: string[] = []) {
  const catalog = useTerminalsCatalog();
  const [reports, setReports] = useState<ActiveReport[]>([]);
  const [plannedByLoad, setPlannedByLoad] = useState<Map<string, string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Terminals a truck is headed to (active pickup, not yet left), and the
  // planned loads attached to those pickups.
  const { terminalIds, loadIds } = useMemo(() => {
    const t = new Set<string>(), l = new Set<string>();
    for (const f of trips) {
      if (f.trip.status === "parked") continue;
      const p = activePickup(f.pickups.filter((x) => x.outcome !== "no_load"));
      if (!p?.terminal_id) continue;
      t.add(String(p.terminal_id));
      if (p.load_id) l.add(p.load_id);
    }
    return { terminalIds: [...t].sort(), loadIds: [...l].sort() };
  }, [trips]);
  // Reports are read for headed terminals AND the terminals the company uses
  // (cards or recent loads), so the Watch list can show problems no truck is
  // headed to yet.
  const readIds = useMemo(() => [...new Set([...terminalIds, ...watchTerminalIds])].sort(), [terminalIds, watchTerminalIds]);
  const key = readIds.join(",") + "|" + loadIds.join(",");
  const tzOf = useMemo(() => new Map(catalog.data.map((t) => [String(t.terminal_id), (t as any).timezone as string | null])), [catalog.data]);

  const load = useCallback(async () => {
    if (readIds.length === 0) { setReports([]); setPlannedByLoad(new Map()); setLoaded(true); return; }
    try {
      const now = Date.now();
      // Reports clear at the terminal's 6-hour checkpoints; fetch the widest
      // window, then keep each terminal's own.
      const cutoffs = new Map(readIds.map((id) => {
        const tz = tzOf.get(id) || "America/New_York";
        return [id, mostRecentClearingCheckpoint(now, tz)];
      }));
      const minCut = Math.min(...cutoffs.values());
      const [r, ll] = await Promise.all([
        supabase.from("terminal_outage_reports")
          .select("report_id, terminal_id, report_type, product_id, supplier_name, created_at")
          .in("terminal_id", readIds).gte("created_at", new Date(minCut).toISOString()),
        loadIds.length
          ? supabase.from("load_lines").select("load_id, product_id").in("load_id", loadIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (r.error) throw r.error;
      setReports(((r.data ?? []) as any[])
        .filter((x) => Date.parse(x.created_at) >= (cutoffs.get(String(x.terminal_id)) ?? 0))
        .map((x) => ({
          reportId: x.report_id, terminalId: String(x.terminal_id), type: x.report_type as ReportType,
          productId: x.product_id ?? null, supplierName: x.supplier_name ?? null, createdAt: x.created_at,
        })));
      const m = new Map<string, string[]>();
      for (const row of (ll.data ?? []) as any[]) {
        if (!row.product_id) continue;
        const list = m.get(row.load_id) ?? [];
        if (!list.includes(String(row.product_id))) list.push(String(row.product_id));
        m.set(row.load_id, list);
      }
      setPlannedByLoad(m);
      setError(null);
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load terminal reports.");
    }
  }, [key, tzOf]); // eslint-disable-line react-hooks/exhaustive-deps

  usePoll(load, [load]);
  return { reports, plannedByLoad, loaded, headedTerminalIds: terminalIds, error, reload: load };
}

// Who marked which report handled. Fails open: a missing table (migration not
// applied yet) leaves every conflict open and reports the error on save.
export function useConflictAcks(companyId: string | null, reportIds: string[], userId: string | null) {
  const [acks, setAcks] = useState<Map<string, Ack>>(new Map());
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const key = [...reportIds].sort().join(",");

  const load = useCallback(async () => {
    if (!companyId || reportIds.length === 0) { setAcks(new Map()); return; }
    try {
      const r = await supabase.from("dispatch_conflict_acks").select("report_id, acked_by, acked_at, note")
        .eq("company_id", companyId).in("report_id", reportIds);
      if (r.error) throw r.error;
      const rows = (r.data ?? []) as { report_id: string; acked_by: string; acked_at: string; note: string | null }[];
      const who = [...new Set(rows.map((x) => x.acked_by))];
      let nm = new Map<string, string>();
      if (who.length) {
        const n = await supabase.rpc("get_display_names_full", { p_user_ids: who });
        nm = new Map(((n.data ?? []) as any[]).map((x) => [x.user_id, x.display_name]));
      }
      setNames(nm);
      setAcks(new Map(rows.map((x) => [x.report_id, { reportId: x.report_id, by: nm.get(x.acked_by) ?? null, at: x.acked_at, note: x.note }])));
    } catch { /* fail open: nothing is marked handled */ }
  }, [companyId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  usePoll(load, [load]);

  const ack = useCallback(async (terminalId: string, ids: string[], note: string): Promise<boolean> => {
    if (!companyId || !userId || ids.length === 0) return false;
    const at = new Date().toISOString();
    const clean = note.trim() || null;
    const { error: e } = await supabase.from("dispatch_conflict_acks").upsert(
      ids.map((id) => ({ company_id: companyId, report_id: id, terminal_id: terminalId, acked_by: userId, acked_at: at, note: clean })),
      { onConflict: "company_id,report_id" });
    if (e) { setError(e.message); return false; }
    setError(null);
    await load();
    return true;
  }, [companyId, userId, load]);

  return { acks, names, error, ack };
}

// Loads per driver per terminal over the last 90 days: what "often sent"
// means. Slow-changing, so refreshed every 10 minutes.
export function useTerminalUse(userIds: string[]) {
  const [loads, setLoads] = useState<{ user_id: string; terminal_id: string }[]>([]);
  const ukey = [...userIds].sort().join(",");
  useEffect(() => {
    if (userIds.length === 0) return;
    let alive = true;
    const run = async () => {
      try {
        const since = new Date(Date.now() - OFTEN_WINDOW_DAYS * 86400000).toISOString();
        const r = await supabase.from("load_log").select("user_id, terminal_id")
          .in("user_id", userIds).eq("status", "loaded").gte("completed_at", since).not("terminal_id", "is", null).limit(5000);
        if (r.error) throw r.error;
        if (alive) setLoads(((r.data ?? []) as any[]).map((x) => ({ user_id: x.user_id, terminal_id: String(x.terminal_id) })));
      } catch { /* fail open: no gaps shown */ }
    };
    void run();
    const id = window.setInterval(() => void run(), 600_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [ukey]); // eslint-disable-line react-hooks/exhaustive-deps
  return loads;
}

export function usePlanData(companyId: string | null) {
  const roster = useCompanyRoster(companyId);
  const catalog = useTerminalsCatalog();
  const [raw, setRaw] = useState<Omit<PlanInputs, "names" | "terminals" | "loads"> | null>(null);
  const loads = useTerminalUse(roster.members.map((m) => m.user_id));
  const [error, setError] = useState<string | null>(null);
  const userIds = useMemo(() => roster.members.map((m) => m.user_id).sort(), [roster.members]);
  const ukey = userIds.join(",");

  const load = useCallback(async () => {
    if (!companyId || userIds.length === 0) return;
    try {
      const [acc, lic, med, twic, port, trk, trl, per, sty, srec, trp] = await Promise.all([
        supabase.from("terminal_access").select("user_id, terminal_id, carded_on").in("user_id", userIds),
        supabase.from("driver_licenses").select("user_id, expiration_date").in("user_id", userIds),
        supabase.from("driver_medical_cards").select("user_id, expiration_date").in("user_id", userIds),
        supabase.from("driver_twic_cards").select("user_id, expiration_date").in("user_id", userIds),
        supabase.from("driver_port_ids").select("user_id, port_name, expiration_date").in("user_id", userIds),
        supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", companyId),
        supabase.from("trailers").select("trailer_id, trailer_name, active").eq("company_id", companyId),
        supabase.from("equipment_permits").select("truck_id, trailer_id, expiration_date, permit_types(name)").eq("company_id", companyId),
        // Service due. Non-fatal: a failure here only hides service alerts.
        supabase.from("service_types").select("service_type_id, name, interval_kind, interval_value, applies_to, is_active").eq("company_id", companyId),
        supabase.from("service_records").select("service_type_id, date, reading_value, created_at, truck_id, trailer_id").eq("company_id", companyId),
        supabase.from("trips").select("truck_id, begin_miles, end_miles, created_at, completed_at").eq("company_id", companyId)
          .order("created_at", { ascending: false }).limit(400),
      ]);
      const firstErr = [acc, trk, trl, per].find((x) => x.error)?.error;
      if (firstErr) throw firstErr;
      const cred = (rows: any, kind: "license" | "medical" | "twic") =>
        ((rows.data ?? []) as any[]).map((r) => ({ user_id: r.user_id, kind, expiration_date: r.expiration_date ?? null }));
      const trucks = new Map(((trk.data ?? []) as any[]).filter((t) => t.active !== false).map((t) => [t.truck_id, t.truck_name ?? "—"]));
      const trailers = new Map(((trl.data ?? []) as any[]).filter((t) => t.active !== false).map((t) => [t.trailer_id, t.trailer_name ?? "—"]));
      const extra = (sty.error || srec.error) ? [] : serviceAlerts({
        trucks, trailers,
        types: ((sty.data ?? []) as any[]).map((t) => ({ ...t, interval_value: t.interval_value == null ? null : Number(t.interval_value) })),
        records: ((srec.data ?? []) as any[]).map((r) => ({ ...r, reading_value: r.reading_value == null ? null : Number(r.reading_value) })),
        trips: ((trp.data ?? []) as any[]),
      });
      setRaw({
        extra,
        access: (acc.data ?? []) as any[],
        credentials: [...cred(lic, "license"), ...cred(med, "medical"), ...cred(twic, "twic")],
        badges: (port.data ?? []) as any[],
        trucks, trailers,
        permits: ((per.data ?? []) as any[]).map((p) => ({
          truck_id: p.truck_id, trailer_id: p.trailer_id, expiration_date: p.expiration_date, permit_name: p.permit_types?.name ?? null,
        })),
      });
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load expirations.");
    }
  }, [companyId, ukey]); // eslint-disable-line react-hooks/exhaustive-deps

  usePoll(load, [load]);

  const input = useMemo<PlanInputs | null>(() => {
    if (!raw) return null;
    return {
      ...raw,
      loads,
      names: new Map(roster.members.map((m) => [m.user_id, m.display_name])),
      terminals: new Map(catalog.data.map((t) => [String(t.terminal_id), { name: t.terminal_name ?? "Terminal", renewal_days: (t as any).renewal_days ?? null }])),
    };
  }, [raw, loads, roster.members, catalog.data]);

  // Terminals this company uses: cards held and recent loads. The Watch list
  // reads reports for these.
  const usedTerminalIds = useMemo(
    () => [...new Set([...(raw?.access ?? []).map((a) => String(a.terminal_id)), ...loads.map((l) => l.terminal_id)])].sort(),
    [raw, loads]);

  return { input, usedTerminalIds, roster: roster.members, error, loading: roster.loading || (!raw && !error), reload: load };
}
