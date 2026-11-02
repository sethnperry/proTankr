"use client";
// app/admin/useCompanyDashboard.ts
//
// One data hook for the Company Dashboard. Composes the shared fleet-data hooks the Dispatch Dashboard already uses
// (expirations and service, open trips, hours clocks, maintenance) and adds the few company-wide reads only this
// screen needs (unit status, shifts, call-outs, delay and billable minutes, the day's activity). Every read fails
// open: a failure hides that figure, never the dashboard. The rules are in lib/company/company.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePlanData } from "@/lib/dispatch/useDispatchData";
import { useFleetTrips } from "@/lib/trips/useFleetTrips";
import { useFleetHos } from "@/lib/telematics/useFleetHos";
import { hosAlerts } from "@/lib/dispatch/hosAlerts";
import { planAlerts } from "@/lib/dispatch/planAlerts";
import { deriveShifts, openShift } from "@/lib/shifts/shiftLogic";
import { useMaintenanceData } from "./useMaintenanceData";
import { campaignBoards, reviewQueue } from "@/lib/maintenance/board";
import { tripSegments, type ExtraRow, type FleetUnit, type RawSeg } from "@/lib/company/company";
import { complianceRows, zoneKeys, type SlfAttestationRow, type Zone } from "@/lib/slf/slf";
import { stopsFor } from "@/lib/slf/loadStops";
import type { ShiftEventRow } from "@/lib/trips/types";

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const POLL_MS = 60_000;

export type DashRange = { fromIso: string; toIso: string; fromDate: string; toDate: string };

export function useCompanyDashboard(o: { companyId: string | null; enabled: boolean; isAdmin: boolean; range: DashRange; dayStartMs: number }) {
  const { companyId, enabled, isAdmin, range, dayStartMs } = o;
  const plan = usePlanData(enabled ? companyId : null);
  const fleet = useFleetTrips(enabled ? companyId : null);
  const hos = useFleetHos(enabled ? companyId : null, enabled);
  const maint = useMaintenanceData(enabled ? companyId : null, enabled);

  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [repairsAwaiting, setRepairsAwaiting] = useState(0);
  const [shifts, setShifts] = useState({ onShift: 0, unconfirmed: 0, onShiftUsers: new Set<string>() });
  const [callouts, setCallouts] = useState({ count: 0, blocking: 0 });
  const [delayedMin, setDelayedMin] = useState(0);
  const [billableMin, setBillableMin] = useState(0);
  const [unreviewedBillable, setUnreviewedBillable] = useState(0);
  const [segs, setSegs] = useState<RawSeg[]>([]);
  const [safetyUnsigned, setSafetyUnsigned] = useState<{ userId: string; title: string }[]>([]);
  const [slfMissing, setSlfMissing] = useState<{ userId: string; county: string }[]>([]);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!companyId) return;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const q = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => { try { const r = await p; return r.error ? null : r.data; } catch { return null; } };

    // Units and what is waiting on the manager.
    const [trk, trl, wo] = await Promise.all([
      q<any[]>(supabase.from("trucks").select("truck_id, truck_name, region, active, status_code, status_updated_at").eq("company_id", companyId)),
      q<any[]>(supabase.from("trailers").select("trailer_id, trailer_name, region, active, status_code, status_updated_at").eq("company_id", companyId)),
      q<any[]>(supabase.from("work_orders").select("work_order_id").eq("company_id", companyId).eq("status", "awaiting_approval").limit(500)),
    ]);
    setUnits([
      ...(trk ?? []).map((t): FleetUnit => ({ id: t.truck_id, name: t.truck_name ?? "—", kind: "truck", region: t.region ?? null, active: t.active !== false, status_code: t.status_code ?? null, status_updated_at: t.status_updated_at ?? null })),
      ...(trl ?? []).map((t): FleetUnit => ({ id: t.trailer_id, name: t.trailer_name ?? "—", kind: "trailer", region: t.region ?? null, active: t.active !== false, status_code: t.status_code ?? null, status_updated_at: t.status_updated_at ?? null })),
    ]);
    setRepairsAwaiting((wo ?? []).length);

    // Shifts: who is on one now, and shifts nobody confirmed in the last week.
    const evs = (await q<ShiftEventRow[]>(supabase.from("shift_events").select("*").eq("company_id", companyId).gte("occurred_at", new Date(now - 7 * 86400_000).toISOString()).order("occurred_at").limit(5000))) ?? [];
    const byUser = new Map<string, ShiftEventRow[]>();
    for (const e of evs) byUser.set(e.user_id, [...(byUser.get(e.user_id) ?? []), e]);
    let onShift = 0, unconfirmed = 0;
    const onShiftUsers = new Set<string>();
    for (const [uid, list] of byUser) {
      const ss = deriveShifts(list, uid, nowIso);
      if (openShift(ss)) { onShift += 1; onShiftUsers.add(uid); }
      unconfirmed += ss.filter((s) => s.unconfirmed).length;
    }
    setShifts({ onShift, unconfirmed, onShiftUsers });

    // Call-outs in the range (Now = today): all active, and the ones still blocking a plan (today or later).
    const co = (await q<any[]>(supabase.from("callouts").select("callout_id, shift_date, status").eq("company_id", companyId).eq("status", "active").gte("shift_date", range.fromDate).lte("shift_date", range.toDate).limit(1000))) ?? [];
    const today = new Date(now).toISOString().slice(0, 10);
    setCallouts({ count: co.length, blocking: co.filter((c) => c.shift_date >= today).length });

    // Trips in the range: unaccounted delay minutes, and the activity ribbon's segments.
    const trips = (await q<any[]>(supabase.from("trips").select("trip_id, driver_id, started_at, completed_at, status").eq("company_id", companyId).not("started_at", "is", null).gte("started_at", new Date(Math.min(Date.parse(range.fromIso), dayStartMs) - 36 * 3600_000).toISOString()).limit(1500))) ?? [];
    const ids = trips.map((t) => t.trip_id as string);
    const pickups: any[] = [], deliveries: any[] = [];
    for (const part of chunk(ids, 150)) {
      const [p, d] = await Promise.all([
        q<any[]>(supabase.from("trip_pickups").select("trip_id, arrived_at, left_at").in("trip_id", part)),
        q<any[]>(supabase.from("trip_deliveries").select("trip_id, arrived_at, left_at, unaccounted_delay_min").in("trip_id", part)),
      ]);
      pickups.push(...(p ?? [])); deliveries.push(...(d ?? []));
    }
    const inRange = new Set(trips.filter((t) => t.started_at >= range.fromIso && t.started_at < range.toIso).map((t) => t.trip_id));
    setDelayedMin(Math.round(deliveries.filter((d) => inRange.has(d.trip_id)).reduce((a, d) => a + (Number(d.unaccounted_delay_min) || 0), 0)));
    const prof = new Map<string, { name: string; region: string | null }>();
    const driverIds = [...new Set(trips.map((t) => t.driver_id as string))];
    for (const part of chunk(driverIds, 150)) {
      const r = await q<any[]>(supabase.from("profiles").select("user_id, display_name, region").in("user_id", part));
      for (const p of r ?? []) prof.set(p.user_id, { name: p.display_name ?? "Driver", region: p.region ?? null });
    }
    const raw: RawSeg[] = [];
    for (const t of trips) {
      const who = prof.get(t.driver_id) ?? { name: "Driver", region: null };
      raw.push(...tripSegments({ userId: t.driver_id, name: who.name, region: who.region, startedAt: t.started_at, completedAt: t.completed_at,
        pickups: pickups.filter((p) => p.trip_id === t.trip_id), deliveries: deliveries.filter((d) => d.trip_id === t.trip_id) }, now));
    }
    const tw = (await q<any[]>(supabase.from("terminal_work").select("work_id, user_id, started_at, ended_at, billable, source").eq("company_id", companyId).gte("started_at", range.fromIso < new Date(dayStartMs).toISOString() ? range.fromIso : new Date(dayStartMs).toISOString()).limit(3000))) ?? [];
    const twUsers = [...new Set(tw.map((r) => r.user_id as string).filter((u) => !prof.has(u)))];
    for (const part of chunk(twUsers, 150)) {
      const r = await q<any[]>(supabase.from("profiles").select("user_id, display_name, region").in("user_id", part));
      for (const p of r ?? []) prof.set(p.user_id, { name: p.display_name ?? "Driver", region: p.region ?? null });
    }
    for (const r of tw) {
      const who = prof.get(r.user_id) ?? { name: "Driver", region: null };
      raw.push({ userId: r.user_id, name: who.name, region: who.region, activity: "terminal", from: Date.parse(r.started_at), to: r.ended_at ? Date.parse(r.ended_at) : now, source: r.source ?? "app" });
    }
    setSegs(raw);

    // Safety meeting: who hasn't signed the open meetings (drivers and leads).
    try {
      const ms = (await q<any[]>(supabase.from("safety_meetings").select("meeting_id, title").eq("company_id", companyId).not("started_at", "is", null).is("closed_at", null).limit(10))) ?? [];
      const who = (await q<any[]>(supabase.from("user_companies").select("user_id, role").eq("company_id", companyId).in("role", ["driver", "lead"]))) ?? [];
      const sg = ms.length ? (await q<any[]>(supabase.from("safety_meeting_signatures").select("meeting_id, user_id").in("meeting_id", ms.map((m) => m.meeting_id)))) ?? [] : [];
      const signed = new Set(sg.map((x) => `${x.meeting_id}|${x.user_id}`));
      setSafetyUnsigned(ms.flatMap((m) => who.filter((w) => !signed.has(`${m.meeting_id}|${w.user_id}`)).map((w) => ({ userId: w.user_id as string, title: m.title as string }))));
    } catch { setSafetyUnsigned([]); }

    // Spotted Lanternfly: in-zone counties on the last two weeks of trips with no attestation.
    try {
      const zone = (await q<Zone[]>(supabase.from("slf_zone_counties").select("state, county").eq("company_id", companyId))) ?? [];
      if (zone.length) {
        const recent = trips.filter((t) => t.started_at >= new Date(now - 14 * 86400_000).toISOString()).slice(0, 200);
        const rids = recent.map((t) => t.trip_id as string);
        const pk: any[] = [], dl: any[] = [], at: SlfAttestationRow[] = [];
        for (const part of chunk(rids, 100)) {
          const [p, d, a] = await Promise.all([
            q<any[]>(supabase.from("trip_pickups").select("*").in("trip_id", part)),
            q<any[]>(supabase.from("trip_deliveries").select("*").in("trip_id", part)),
            q<SlfAttestationRow[]>(supabase.from("slf_attestations").select("*").in("trip_id", part)),
          ]);
          pk.push(...(p ?? [])); dl.push(...(d ?? [])); at.push(...(a ?? []));
        }
        const stops = await stopsFor(pk, dl);
        setSlfMissing(complianceRows(recent as any, stops, zoneKeys(zone), at).filter((r) => !r.attested).map((r) => ({ userId: r.driverId, county: `${r.county}, ${r.state}` })));
      } else setSlfMissing([]);
    } catch { setSlfMissing([]); }

    // Billable terminal time in the range, and how much of it nobody has reviewed (admins only: the review log is admin-read).
    const inTw = tw.filter((r) => r.billable && r.ended_at && r.started_at >= range.fromIso && r.started_at < range.toIso);
    const minutes = (r: any) => Math.max(0, Math.round((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60_000));
    if (isAdmin && inTw.length) {
      const reviewed = new Set<string>();
      for (const part of chunk(inTw.map((r) => r.work_id as string), 150)) {
        const r = await q<any[]>(supabase.from("terminal_work_overrides").select("work_id").in("work_id", part));
        for (const x of r ?? []) reviewed.add(x.work_id);
      }
      const open = inTw.filter((r) => !reviewed.has(r.work_id));
      setBillableMin(open.reduce((a, r) => a + minutes(r), 0)); setUnreviewedBillable(open.length);
    } else { setBillableMin(0); setUnreviewedBillable(0); }
  }, [companyId, range.fromIso, range.toIso, range.fromDate, range.toDate, dayStartMs, isAdmin]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const id = window.setInterval(() => setTick((n) => n + 1), POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") setTick((n) => n + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled, load]);
  useEffect(() => { if (tick > 0) void load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = useMemo(() => (plan.input ? planAlerts(plan.input, 30) : []), [plan.input]);
  const hosRisk = useMemo(() => hosAlerts(fleet.trips.map((f) => ({ tripId: f.trip.trip_id, userId: f.trip.driver_id, driverName: f.driverName, truckName: f.truckName })), hos, Date.now()), [fleet.trips, hos]);
  const boards = useMemo(() => campaignBoards(maint.campaigns, maint.units, maint.inspections), [maint.campaigns, maint.units, maint.inspections]);
  const heatExtras = useMemo((): ExtraRow[] => {
    const name = (id: string) => plan.roster.find((m) => m.user_id === id)?.display_name ?? "Driver";
    const region = (id: string) => plan.roster.find((m) => m.user_id === id)?.region ?? null;
    const today = new Date().toISOString().slice(0, 10);
    return [
      { label: "Safety meeting", items: safetyUnsigned.map((s) => ({ subjectId: s.userId, subject: name(s.userId), label: "Not signed", state: "expired" as const, region: region(s.userId) })) },
      { label: "Spotted Lanternfly", items: slfMissing.map((s) => ({ subjectId: s.userId, subject: name(s.userId), label: s.county, state: "expired" as const, region: region(s.userId) })) },
      { label: "Inspection campaigns", items: boards.filter((b) => !b.campaign.closed_at).flatMap((b) => b.outstanding.map((u) => ({ subjectId: u.id, subject: `${u.kind === "truck" ? "Truck" : "Trailer"} ${u.name}`, label: b.campaign.name, state: (b.campaign.due_on && b.campaign.due_on < today ? "expired" : "soon") as "expired" | "soon", region: u.region }))) },
    ].filter((r) => r.items.length > 0);
  }, [plan.roster, safetyUnsigned, slfMissing, boards]);
  const pendingReviews = useMemo(() => reviewQueue(maint.inspections).length, [maint.inspections]);

  return { plan, alerts, heatExtras, fleet, hosRisk, boards, pendingReviews, units, repairsAwaiting, shifts, callouts, delayedMin, billableMin, unreviewedBillable, segs, reload: load };
}
