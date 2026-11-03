"use client";
// app/admin/DeadheadModal.tsx
//
// Company Dashboard → Billable time. Empty (deadhead) segments across trips for a period, with the admin's
// billable decision and totals. Tap a row to decide it or open the trip's PTD. Admin only (the flags are
// internal). Thin data wrapper around the shared report shell.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PeriodPicker } from "@/lib/ui/PeriodPicker";
import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";
import { emailReportPdf } from "@/lib/reports/emailReport";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { locationTitle } from "@/lib/trips/deliveryLocations";
import { KIND_LABEL, fmtMin, type Flags } from "@/lib/trips/deadhead";
import { billableLabel, deadheadColumns, deadheadFilters, deadheadRows, deadheadSummary, emptyMoveRows, type DeadheadRow } from "@/lib/trips/deadheadReport";
import type { EmptyMoveRow, TripDeliveryRow, TripPickupRow, TripRow } from "@/lib/trips/types";

const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const btn = (on?: boolean): React.CSSProperties => ({ flex: 1, padding: "13px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export default function DeadheadModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const router = useRouter();
  const [range, setRange] = useState<DateRange>(() => lastDays(30));
  const [data, setData] = useState<{ trips: TripRow[]; pickups: TripPickupRow[]; deliveries: TripDeliveryRow[]; places: Record<string, { name: string; city: string | null; state: string | null }>; moves: EmptyMoveRow[] } | null>(null);
  const [flags, setFlags] = useState<Record<string, Flags>>({});
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<DeadheadRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);
  const nameOf = (id: string) => nameById[id] ?? "Driver";

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setData(null); setError(null);
    void (async () => {
      try {
        let tq = supabase.from("trips").select("*").eq("company_id", companyId).not("started_at", "is", null).order("started_at", { ascending: false }).limit(2000);
        if (range) { const b = rangeBounds(range); tq = tq.gte("started_at", b.fromIso).lt("started_at", b.toIso); }
        const { data: trips, error: e } = await tq;
        if (e) throw e;
        const ids = ((trips ?? []) as TripRow[]).map((t) => t.trip_id);
        const pickups: TripPickupRow[] = [], deliveries: TripDeliveryRow[] = [], fl: Record<string, Flags> = {};
        for (const part of chunk(ids, 150)) {
          const [p, d, f] = await Promise.all([
            supabase.from("trip_pickups").select("*").in("trip_id", part),
            supabase.from("trip_deliveries").select("*").in("trip_id", part),
            supabase.from("trip_billing_flags").select("trip_id, segment_key, billable").in("trip_id", part),
          ]);
          pickups.push(...((p.data ?? []) as TripPickupRow[])); deliveries.push(...((d.data ?? []) as TripDeliveryRow[]));
          for (const r of (f.data ?? []) as { trip_id: string; segment_key: string; billable: boolean }[]) (fl[r.trip_id] ??= {})[r.segment_key] = r.billable;
        }
        let mq = supabase.from("empty_moves").select("*").eq("company_id", companyId).not("ended_at", "is", null).order("started_at", { ascending: false }).limit(2000);
        if (range) { const b = rangeBounds(range); mq = mq.gte("started_at", b.fromIso).lt("started_at", b.toIso); }
        const { data: mv } = await mq; // fails open: before the empty-moves table exists this is just empty
        const moves = ((mv ?? []) as EmptyMoveRow[]);
        const locIds = [...new Set([...deliveries.map((d) => d.location_id), ...moves.flatMap((m) => [m.from_place_id, m.to_place_id])].filter(Boolean) as string[])];
        const places: Record<string, { name: string; city: string | null; state: string | null }> = {};
        for (const part of chunk(locIds, 150)) {
          const { data: locs } = await supabase.from("delivery_locations").select("location_id, name, location_number, city, state").in("location_id", part);
          for (const l of (locs ?? []) as any[]) places[l.location_id] = { name: locationTitle(l), city: l.city ?? null, state: l.state ?? null };
        }
        if (!alive) return;
        setFlags(fl); setData({ trips: (trips ?? []) as TripRow[], pickups, deliveries, places, moves });
      } catch (e: any) { if (alive) setError(e?.message ?? "Couldn't load trips."); }
    })();
    return () => { alive = false; };
  }, [open, companyId, range?.start, range?.end]);

  const rows = useMemo(() => (data ? [...deadheadRows(data.trips, data.pickups, data.deliveries, flags, (d) => ({ name: (d.location_id && data.places[d.location_id]?.name) || d.one_off_name || "Delivery", city: (d.location_id && data.places[d.location_id]?.city) || null, state: (d.location_id && data.places[d.location_id]?.state) || null })), ...emptyMoveRows(data.moves, (id, text) => (id && data.places[id]?.name) || text || "Unknown")].sort((a, b) => b.date.localeCompare(a.date)) : []), [data, flags]);
  const columns = useMemo(() => deadheadColumns(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters = useMemo(() => deadheadFilters(nameOf), [nameById]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (billable: boolean | null) => {
    if (!sel) return;
    setBusy(true);
    const trip = data?.trips.find((t) => t.trip_id === sel.tripId);
    const { data: u } = await supabase.auth.getUser();
    if (sel.moveId) {
      const r = await supabase.from("empty_moves").update({ billable }).eq("move_id", sel.moveId);
      setBusy(false);
      if (r.error) { setError(r.error.message); return; }
      setData((d) => (d ? { ...d, moves: d.moves.map((m) => (m.move_id === sel.moveId ? { ...m, billable } : m)) } : d));
      setSel(null);
      return;
    }
    const res = billable == null
      ? await supabase.from("trip_billing_flags").delete().eq("trip_id", sel.tripId).eq("segment_key", sel.segmentKey)
      : await supabase.from("trip_billing_flags").upsert({ trip_id: sel.tripId, segment_key: sel.segmentKey, company_id: trip?.company_id ?? companyId, billable, set_by: u.user?.id ?? null, set_at: new Date().toISOString() }, { onConflict: "trip_id,segment_key" });
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    setFlags((f) => { const n = { ...f, [sel.tripId]: { ...(f[sel.tripId] ?? {}) } }; if (billable == null) delete n[sel.tripId][sel.segmentKey]; else n[sel.tripId][sel.segmentKey] = billable; return n; });
    setSel(null);
  };

  return (
    <>
      <ReportShell open={open && !sel} title="Billable time" onClose={onClose} rows={rows} columns={columns} filters={filters} getKey={(r) => r.key}
        onOpenRow={setSel} summary={deadheadSummary} loading={!data && !error} error={error} empty="No empty segments or moves in this period." fileName="billable_time"
        onEmailPdf={(doc) => void emailReportPdf(doc)} periodSlot={<PeriodPicker companyId={companyId} userId={undefined} allowAll onChange={setRange} />} />
      <FullscreenModal open={!!sel} title="Empty segment" onClose={() => setSel(null)} footer={null}>
        {sel && (
          <div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{nameOf(sel.driverId)} · {KIND_LABEL[sel.kind]}</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: "6px 0" }}>{sel.from} → {sel.to}</div>
            <div className="dash-num" style={{ fontSize: 30, fontWeight: 900 }}>{fmtMin(sel.minutes)}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{billableLabel(sel.billable)}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button type="button" disabled={busy} style={btn(sel.billable === true)} onClick={() => void decide(sel.billable === true ? null : true)}>Billable</button>
              <button type="button" disabled={busy} style={btn(sel.billable === false)} onClick={() => void decide(sel.billable === false ? null : false)}>Not billable</button>
            </div>
            {sel.tripId && <button type="button" style={{ ...btn(), flex: "none", width: "100%", marginTop: 10 }} onClick={() => router.push(`/planner/trips/${sel.tripId}`)}>Open the PTD</button>}
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
