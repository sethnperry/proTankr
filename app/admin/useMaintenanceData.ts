"use client";
// app/admin/useMaintenanceData.ts
//
// Thin data hook for the maintenance board: units, service types and records, permits, inspections and
// campaigns for the company. The rules are in lib/maintenance/board.ts.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { BoardInspection, BoardPermit, BoardRecord, BoardServiceType, BoardUnit, Campaign } from "@/lib/maintenance/board";

type Data = { units: BoardUnit[]; types: BoardServiceType[]; records: BoardRecord[]; permits: BoardPermit[]; inspections: BoardInspection[]; campaigns: Campaign[] };
const EMPTY: Data = { units: [], types: [], records: [], permits: [], inspections: [], campaigns: [] };

export function useMaintenanceData(companyId: string | null, enabled: boolean) {
  const [data, setData] = useState<Data>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError(null);
    const since = new Date(Date.now() - 400 * 86400_000).toISOString();
    const [tr, tl, st, sr, ep, ui, ic] = await Promise.all([
      supabase.from("trucks").select("truck_id, truck_name, region, active").eq("company_id", companyId),
      supabase.from("trailers").select("trailer_id, trailer_name, region, active").eq("company_id", companyId),
      supabase.from("service_types").select("service_type_id, name, interval_kind, interval_value, applies_to, is_active").eq("company_id", companyId),
      supabase.from("service_records").select("truck_id, trailer_id, service_type_id, date, reading_value, created_at").eq("company_id", companyId).order("date", { ascending: false }).limit(5000),
      supabase.from("equipment_permits").select("truck_id, trailer_id, expiration_date, permit_types(name)").eq("company_id", companyId),
      supabase.from("unit_inspections").select("inspection_id, truck_id, trailer_id, unit_kind, driver_id, campaign_id, created_at, overall, review_status, items").eq("company_id", companyId).gte("created_at", since).order("created_at", { ascending: false }).limit(3000),
      supabase.from("inspection_campaigns").select("campaign_id, name, unit_kind, region, due_on, closed_at, created_at").eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    const err = [tr, tl, st, sr, ep, ui, ic].find((r) => r.error)?.error;
    if (err) setError(err.message);
    const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
    setData({
      units: [
        ...((tr.data ?? []) as any[]).map((t) => ({ id: t.truck_id, kind: "truck" as const, name: t.truck_name, region: t.region ?? null, active: !!t.active })),
        ...((tl.data ?? []) as any[]).map((t) => ({ id: t.trailer_id, kind: "trailer" as const, name: t.trailer_name, region: t.region ?? null, active: !!t.active })),
      ],
      types: (st.data ?? []) as BoardServiceType[],
      records: ((sr.data ?? []) as any[]).map((r) => ({ unitId: r.truck_id ?? r.trailer_id, service_type_id: r.service_type_id, date: r.date, reading_value: r.reading_value, created_at: r.created_at })),
      permits: ((ep.data ?? []) as any[]).map((p) => ({ unitId: p.truck_id ?? p.trailer_id, name: one<any>(p.permit_types)?.name ?? "Permit", expiration_date: p.expiration_date })),
      inspections: ((ui.data ?? []) as any[]).map((i) => ({ inspection_id: i.inspection_id, unitId: i.truck_id ?? i.trailer_id, kind: i.unit_kind, driver_id: i.driver_id, campaign_id: i.campaign_id, created_at: i.created_at, overall: i.overall, review_status: i.review_status, items: i.items ?? [] })),
      campaigns: (ic.data ?? []) as Campaign[],
    });
    setLoading(false);
  }, [companyId]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  return { ...data, loading, error, reload: load };
}
