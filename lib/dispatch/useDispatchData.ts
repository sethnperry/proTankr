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
import { swapRunOrder } from "./dispatchTrip";
import { serviceAlerts, type ServiceInputs } from "./serviceAlerts";
import { useFleetEngineHours } from "../telematics/useFleetEngineHours";
import type { Ack } from "./acks";
import type { CertType, CertRecord } from "./certs";
import { buildUsageItems, type AllocContract, type UsageItem } from "./allocation";
import { DEFAULT_TIMELINE_SETTINGS, type HistTrip, type TimelineSettings } from "./forecast";

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
  const [raw, setRaw] = useState<Omit<PlanInputs, "names" | "terminals" | "loads" | "extra"> | null>(null);
  // Service-due inputs kept raw so the truck hour meters (a separate, slower fetch) can be folded in.
  const [svc, setSvc] = useState<Omit<ServiceInputs, "engineHours"> | null>(null);
  const engineHours = useFleetEngineHours(companyId);
  const loads = useTerminalUse(roster.members.map((m) => m.user_id));
  const [error, setError] = useState<string | null>(null);
  // Region of each truck and trailer, for the dashboard's region filter.
  const [unitRegions, setUnitRegions] = useState<Map<string, string | null>>(new Map());
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
        supabase.from("trucks").select("truck_id, truck_name, active, region").eq("company_id", companyId),
        supabase.from("trailers").select("trailer_id, trailer_name, active, region").eq("company_id", companyId),
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
      setUnitRegions(new Map([
        ...((trk.data ?? []) as any[]).map((t) => [t.truck_id, (t.region ?? null) as string | null] as const),
        ...((trl.data ?? []) as any[]).map((t) => [t.trailer_id, (t.region ?? null) as string | null] as const),
      ]));
      const trucks = new Map(((trk.data ?? []) as any[]).filter((t) => t.active !== false).map((t) => [t.truck_id, t.truck_name ?? "—"]));
      const trailers = new Map(((trl.data ?? []) as any[]).filter((t) => t.active !== false).map((t) => [t.trailer_id, t.trailer_name ?? "—"]));
      setSvc((sty.error || srec.error) ? null : {
        trucks, trailers,
        types: ((sty.data ?? []) as any[]).map((t) => ({ ...t, interval_value: t.interval_value == null ? null : Number(t.interval_value) })),
        records: ((srec.data ?? []) as any[]).map((r) => ({ ...r, reading_value: r.reading_value == null ? null : Number(r.reading_value) })),
        trips: ((trp.data ?? []) as any[]),
      });
      setRaw({
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
      extra: svc ? serviceAlerts({ ...svc, engineHours }) : [],
      loads,
      names: new Map(roster.members.map((m) => [m.user_id, m.display_name])),
      terminals: new Map(catalog.data.map((t) => [String(t.terminal_id), { name: t.terminal_name ?? "Terminal", renewal_days: (t as any).renewal_days ?? null }])),
    };
  }, [raw, svc, engineHours, loads, roster.members, catalog.data]);

  // Terminals this company uses: cards held and recent loads. The Watch list
  // reads reports for these.
  const usedTerminalIds = useMemo(
    () => [...new Set([...(raw?.access ?? []).map((a) => String(a.terminal_id)), ...loads.map((l) => l.terminal_id)])].sort(),
    [raw, loads]);

  return { input, usedTerminalIds, unitRegions, roster: roster.members, error, loading: roster.loading || (!raw && !error), reload: load };
}

// Completed deliveries at one drop location, newest data for ranking drivers
// by how often they have delivered there. The driver is whoever finished the
// drop (a handoff driver), else the trip's driver.
export function useLocationDeliveries(companyId: string | null, locationId: string | null) {
  const [rows, setRows] = useState<{ driver_id: string; finished_at: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId || !locationId) { setRows([]); setError(null); return; }
    let off = false;
    setLoading(true);
    supabase.from("trip_deliveries")
      .select("delivering_driver_id, left_at, trips!inner(driver_id, company_id)")
      .eq("location_id", locationId).eq("status", "complete").eq("trips.company_id", companyId)
      .order("left_at", { ascending: false }).limit(1000)
      .then(({ data, error: e }) => {
        if (off) return;
        setLoading(false);
        if (e) { setError(e.message); setRows([]); return; }
        setError(null);
        setRows(((data ?? []) as any[]).map((d) => ({
          driver_id: d.delivering_driver_id ?? d.trips?.driver_id ?? "", finished_at: d.left_at ?? null,
        })).filter((d) => d.driver_id));
      });
    return () => { off = true; };
  }, [companyId, locationId]);
  return { rows, loading, error };
}

// What each driver holds right now: the active combo they've claimed. A
// spare truck or trailer swapped in shows up as soon as they pick it.
export type HeldEquipment = { truckId: string; trailerId: string; since: string | null };
export function useDriverEquipment(companyId: string | null) {
  const [held, setHeld] = useState<Map<string, HeldEquipment>>(new Map());
  const load = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from("equipment_combos").select("truck_id, trailer_id, claimed_by, claimed_at")
      .eq("company_id", companyId).eq("active", true).not("claimed_by", "is", null);
    const m = new Map<string, HeldEquipment>();
    for (const r of (data ?? []) as any[]) {
      const prev = m.get(r.claimed_by);
      if (!prev || (r.claimed_at ?? "") > (prev.since ?? "")) m.set(r.claimed_by, { truckId: r.truck_id, trailerId: r.trailer_id, since: r.claimed_at ?? null });
    }
    setHeld(m);
  }, [companyId]);
  usePoll(load, [load]);
  return held;
}

// Trailer certifications required at one terminal, who has one, and a
// thumbnail of the uploaded certificate (a signed link to the first page).
export type CertThumb = { url: string | null; isPdf: boolean };
export function useTerminalCerts(companyId: string | null, terminalId: string | null) {
  const [state, setState] = useState<{ types: CertType[]; records: CertRecord[]; thumbs: Map<string, CertThumb> }>({ types: [], records: [], thumbs: new Map() });
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId || !terminalId) { setState({ types: [], records: [], thumbs: new Map() }); return; }
    let off = false;
    (async () => {
      setLoading(true);
      try {
        const t = await supabase.from("permit_types").select("permit_type_id, name, applies_to")
          .eq("company_id", companyId).eq("terminal_id", terminalId).eq("is_active", true);
        const types = ((t.data ?? []) as any[]).filter((x) => x.applies_to !== "truck").map((x) => ({ permit_type_id: x.permit_type_id, name: x.name })) as CertType[];
        if (types.length === 0) { if (!off) setState({ types: [], records: [], thumbs: new Map() }); return; }
        const ids = types.map((x) => x.permit_type_id);
        const [r, a] = await Promise.all([
          supabase.from("equipment_permits").select("trailer_id, permit_type_id, expiration_date").in("permit_type_id", ids).not("trailer_id", "is", null),
          supabase.from("equipment_attachments").select("equipment_id, equipment_type, file_path, mime_type, page_order").in("permit_type_id", ids).order("page_order"),
        ]);
        const first = new Map<string, { path: string; mime: string }>();
        for (const x of (a.data ?? []) as any[]) if (x.equipment_type === "trailer" && !first.has(x.equipment_id)) first.set(x.equipment_id, { path: x.file_path, mime: x.mime_type ?? "" });
        const thumbs = new Map<string, CertThumb>();
        await Promise.all([...first].map(async ([trailerId, f]) => {
          const isPdf = f.mime.includes("pdf");
          if (isPdf || !f.mime.startsWith("image/")) { thumbs.set(trailerId, { url: null, isPdf }); return; }
          const { data } = await supabase.storage.from("equipment-docs").createSignedUrl(f.path, 3600);
          thumbs.set(trailerId, { url: data?.signedUrl ?? null, isPdf: false });
        }));
        if (!off) setState({ types, records: ((r.data ?? []) as CertRecord[]), thumbs });
      } catch {
        if (!off) setState({ types: [], records: [], thumbs: new Map() });
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => { off = true; };
  }, [companyId, terminalId]);
  return { ...state, loading };
}

// Finished trips from the last 6 months, used to forecast how long each leg
// takes at a given time of day. Read once (history, not live).
export function useTripHistory(companyId: string | null) {
  const [trips, setTrips] = useState<HistTrip[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    let off = false;
    setLoading(true);
    const since = new Date(Date.now() - 183 * 86400000).toISOString();
    supabase.from("trips")
      .select("driver_id, started_at, trip_pickups(terminal_id, arrived_at, left_at, outcome, seq), trip_deliveries(location_id, arrived_at, left_at, seq)")
      .eq("company_id", companyId).eq("status", "complete").gte("started_at", since)
      .order("started_at", { ascending: false }).limit(1500)
      .then(({ data }) => {
        if (off) return;
        setLoading(false);
        setTrips(((data ?? []) as any[]).map((t) => ({
          driver_id: t.driver_id, started_at: t.started_at, pickups: t.trip_pickups ?? [], deliveries: t.trip_deliveries ?? [],
        })));
      });
    return () => { off = true; };
  }, [companyId]);
  return { trips, loading };
}

// Company rules the forecast flags against (trip_settings), with defaults.
export function useTimelineSettings(companyId: string | null): TimelineSettings {
  const [s, setS] = useState<TimelineSettings>(DEFAULT_TIMELINE_SETTINGS);
  useEffect(() => {
    if (!companyId) return;
    let off = false;
    supabase.from("trip_settings").select("max_shift_hours, gauging_cutoff, gauging_minutes").eq("company_id", companyId).maybeSingle()
      .then(({ data, error }) => {
        if (off || error || !data) return;
        const d = data as any;
        setS({
          maxShiftHours: Number(d.max_shift_hours ?? 12),
          gaugingCutoff: String(d.gauging_cutoff ?? "23:30").slice(0, 5),
          gaugingMinutes: Number(d.gauging_minutes ?? 30),
        });
      });
    return () => { off = true; };
  }, [companyId]);
  return s;
}

// Loads dispatch has planned that the driver hasn't begun yet.
export type DispatchedTrip = {
  trip_id: string; driver_id: string; planned_start_at: string | null; dispatch_seq: number | null;
  order: string | null; terminal: string | null; supplier_id: string | null; locationId: string | null;
};
export function useDispatchedTrips(companyId: string | null) {
  const [trips, setTrips] = useState<DispatchedTrip[]>([]);
  const load = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase.from("trips")
      .select("trip_id, driver_id, planned_start_at, dispatch_seq, trip_orders(order_number, is_primary), trip_pickups(name, supplier_id), trip_deliveries(location_id, status)")
      .eq("company_id", companyId).eq("status", "dispatched").order("planned_start_at");
    setTrips(((data ?? []) as any[]).map((t) => ({
      trip_id: t.trip_id, driver_id: t.driver_id, planned_start_at: t.planned_start_at, dispatch_seq: t.dispatch_seq,
      order: (t.trip_orders ?? []).find((o: any) => o.is_primary)?.order_number ?? null,
      terminal: t.trip_pickups?.[0]?.name ?? null, supplier_id: t.trip_pickups?.[0]?.supplier_id ?? null,
      locationId: (t.trip_deliveries ?? []).find((d: any) => d.status !== "cancelled")?.location_id ?? null,
    })));
  }, [companyId]);
  usePoll(load, [load]);
  return { trips, reload: load };
}

/** Writes the rows a dispatch builds, parents first. Returns an error message or null. */
export async function writeDispatched(rows: { trip: any; orders: any[]; pickups: any[]; deliveries: any[]; events: any[] }): Promise<string | null> {
  const a = await supabase.from("trips").insert(rows.trip);
  if (a.error) return a.error.message;
  for (const [table, list] of [["trip_orders", rows.orders], ["trip_pickups", rows.pickups], ["trip_deliveries", rows.deliveries], ["trip_events", rows.events]] as const) {
    if (!list.length) continue;
    const r = await supabase.from(table).insert(list);
    if (r.error) {
      await supabase.from("trips").delete().eq("trip_id", rows.trip.trip_id); // don't leave a half-written load
      return r.error.message;
    }
  }
  return null;
}

export async function cancelDispatched(tripId: string, userId: string): Promise<string | null> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("trips").update({
    status: "cancelled", cancelled_at: now, cancelled_by: userId, cancel_reasons: ["dispatch_cancelled"], client_updated_at: now,
  }).eq("trip_id", tripId).eq("status", "dispatched");
  return error ? error.message : null;
}

/** Swaps the run order of two not-begun loads. Only works while both are still 'dispatched'. */
export async function swapDispatched(a: DispatchedTrip, b: DispatchedTrip): Promise<string | null> {
  const [pa, pb] = swapRunOrder(a, b);
  const now = new Date().toISOString();
  for (const pt of [pa, pb]) {
    const { error, data } = await supabase.from("trips")
      .update({ planned_start_at: pt.planned_start_at, dispatch_seq: pt.dispatch_seq, client_updated_at: now })
      .eq("trip_id", pt.trip_id).eq("status", "dispatched").select("trip_id");
    if (error) return error.message;
    if (!data?.length) return "That load was already begun, so it can't be moved.";
  }
  return null;
}

// Loads and bookings per supplier and terminal over the last two weeks, for
// counting against contract limits.
export function useSupplierUsage(companyId: string | null) {
  const [items, setItems] = useState<UsageItem[]>([]);
  const load = useCallback(async () => {
    if (!companyId) return;
    const since = new Date(Date.now() - 16 * 86400000).toISOString();
    const { data } = await supabase.from("trips")
      .select("status, planned_start_at, started_at, trip_pickups(pickup_id, terminal_id, supplier_id, arrived_at, left_at, outcome, seq), trip_compartment_loads(pickup_id, supplier_id, gross_gallons, disposition)")
      .eq("company_id", companyId).neq("status", "cancelled")
      .or(`started_at.gte.${since},planned_start_at.gte.${since}`).limit(1500);
    setItems(buildUsageItems(((data ?? []) as any[]).map((t) => ({
      status: t.status, planned_start_at: t.planned_start_at, started_at: t.started_at,
      pickups: t.trip_pickups ?? [], compLoads: (t.trip_compartment_loads ?? []).map((c: any) => ({ ...c, gross_gallons: c.gross_gallons == null ? null : Number(c.gross_gallons) })),
    }))));
  }, [companyId]);
  usePoll(load, [load]);
  return items;
}

// Every contract with a limit, company-wide.
export function useCompanyContracts(companyId: string | null) {
  const [contracts, setContracts] = useState<AllocContract[]>([]);
  const load = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase.from("supplier_contracts")
      .select("supplier_id,terminal_id,limit_basis,per_day,per_week,reset_dow,reset_time,paused").eq("company_id", companyId);
    if (error) return; // before the migration: no limits
    setContracts(((data ?? []) as any[]).map((r) => ({
      ...r, per_day: r.per_day == null ? null : Number(r.per_day), per_week: r.per_week == null ? null : Number(r.per_week),
      reset_time: String(r.reset_time ?? "00:00").slice(0, 5),
    })));
  }, [companyId]);
  usePoll(load, [load]);
  return contracts;
}
