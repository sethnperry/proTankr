"use client";
// app/planner/hooks/useOpenCampaigns.ts
//
// The open inspection campaigns for the company and which of them these units have already been inspected for,
// so the inspection sheet can say "Fall tire check is open for this unit". Thin data hook; the rules are in
// lib/maintenance/board.ts.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { openCampaignsFor, type BoardInspection, type BoardUnit, type Campaign } from "@/lib/maintenance/board";

export function useOpenCampaigns(companyId: string | null, enabled: boolean, unitRegions: Record<string, string | null>) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [done, setDone] = useState<{ campaign_id: string; unitId: string }[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data: c } = await supabase.from("inspection_campaigns").select("campaign_id, name, unit_kind, region, due_on, closed_at, created_at").eq("company_id", companyId).is("closed_at", null);
    const list = (c ?? []) as Campaign[];
    setCampaigns(list);
    if (!list.length) { setDone([]); return; }
    const { data: i } = await supabase.from("unit_inspections").select("campaign_id, truck_id, trailer_id").in("campaign_id", list.map((x) => x.campaign_id));
    setDone(((i ?? []) as any[]).map((r) => ({ campaign_id: r.campaign_id as string, unitId: (r.truck_id ?? r.trailer_id) as string })));
  }, [companyId]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const campaignsFor = useCallback((u: { kind: "truck" | "trailer"; id: string }): Campaign[] => {
    const unit: BoardUnit = { id: u.id, kind: u.kind, name: "", region: unitRegions[u.id] ?? null, active: true };
    const insp = done.map((d) => ({ campaign_id: d.campaign_id, unitId: d.unitId }) as unknown as BoardInspection);
    return openCampaignsFor(unit, campaigns, insp);
  }, [campaigns, done, unitRegions]);

  return { campaignsFor, reload: load };
}
