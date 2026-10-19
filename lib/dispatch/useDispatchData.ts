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
//                    badges, and the company's equipment permits.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { activePickup } from "@/lib/trips/tripFlow";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import { mostRecentClearingCheckpoint } from "@/app/planner/utils/dates";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { useTerminalsCatalog } from "@/lib/queries/useTerminalsCatalog";
import type { ActiveReport, ReportType } from "./conflicts";
import type { PlanInputs } from "./planAlerts";

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

export function useFleetReports(trips: FleetTrip[]) {
  const catalog = useTerminalsCatalog();
  const [reports, setReports] = useState<ActiveReport[]>([]);
  const [plannedByLoad, setPlannedByLoad] = useState<Map<string, string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);

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
  const key = terminalIds.join(",") + "|" + loadIds.join(",");
  const tzOf = useMemo(() => new Map(catalog.data.map((t) => [String(t.terminal_id), (t as any).timezone as string | null])), [catalog.data]);

  const load = useCallback(async () => {
    if (terminalIds.length === 0) { setReports([]); setPlannedByLoad(new Map()); return; }
    try {
      const now = Date.now();
      // Reports clear at the terminal's 6-hour checkpoints; fetch the widest
      // window, then keep each terminal's own.
      const cutoffs = new Map(terminalIds.map((id) => {
        const tz = tzOf.get(id) || "America/New_York";
        return [id, mostRecentClearingCheckpoint(now, tz)];
      }));
      const minCut = Math.min(...cutoffs.values());
      const [r, ll] = await Promise.all([
        supabase.from("terminal_outage_reports")
          .select("report_id, terminal_id, report_type, product_id, supplier_name, created_at")
          .in("terminal_id", terminalIds).gte("created_at", new Date(minCut).toISOString()),
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
    } catch (e: any) {
      setError(e?.message ?? "Couldn't load terminal reports.");
    }
  }, [key, tzOf]); // eslint-disable-line react-hooks/exhaustive-deps

  usePoll(load, [load]);
  return { reports, plannedByLoad, error, reload: load };
}

export function usePlanData(companyId: string | null) {
  const roster = useCompanyRoster(companyId);
  const catalog = useTerminalsCatalog();
  const [raw, setRaw] = useState<Omit<PlanInputs, "names" | "terminals"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userIds = useMemo(() => roster.members.map((m) => m.user_id).sort(), [roster.members]);
  const ukey = userIds.join(",");

  const load = useCallback(async () => {
    if (!companyId || userIds.length === 0) return;
    try {
      const [acc, lic, med, twic, port, trk, trl, per] = await Promise.all([
        supabase.from("terminal_access").select("user_id, terminal_id, carded_on").in("user_id", userIds),
        supabase.from("driver_licenses").select("user_id, expiration_date").in("user_id", userIds),
        supabase.from("driver_medical_cards").select("user_id, expiration_date").in("user_id", userIds),
        supabase.from("driver_twic_cards").select("user_id, expiration_date").in("user_id", userIds),
        supabase.from("driver_port_ids").select("user_id, port_name, expiration_date").in("user_id", userIds),
        supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", companyId),
        supabase.from("trailers").select("trailer_id, trailer_name, active").eq("company_id", companyId),
        supabase.from("equipment_permits").select("truck_id, trailer_id, expiration_date, permit_types(name)").eq("company_id", companyId),
      ]);
      const firstErr = [acc, trk, trl, per].find((x) => x.error)?.error;
      if (firstErr) throw firstErr;
      const cred = (rows: any, kind: "license" | "medical" | "twic") =>
        ((rows.data ?? []) as any[]).map((r) => ({ user_id: r.user_id, kind, expiration_date: r.expiration_date ?? null }));
      setRaw({
        access: (acc.data ?? []) as any[],
        credentials: [...cred(lic, "license"), ...cred(med, "medical"), ...cred(twic, "twic")],
        badges: (port.data ?? []) as any[],
        trucks: new Map(((trk.data ?? []) as any[]).filter((t) => t.active !== false).map((t) => [t.truck_id, t.truck_name ?? "—"])),
        trailers: new Map(((trl.data ?? []) as any[]).filter((t) => t.active !== false).map((t) => [t.trailer_id, t.trailer_name ?? "—"])),
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
      names: new Map(roster.members.map((m) => [m.user_id, m.display_name])),
      terminals: new Map(catalog.data.map((t) => [String(t.terminal_id), { name: t.terminal_name ?? "Terminal", renewal_days: (t as any).renewal_days ?? null }])),
    };
  }, [raw, roster.members, catalog.data]);

  return { input, roster: roster.members, error, loading: roster.loading || (!raw && !error), reload: load };
}
