"use client";
// app/admin/MaintenanceModal.tsx
//
// Company Dashboard → Maintenance. Thin data wrapper around MaintenanceView: loads the company's units, service
// history, permits, inspections and campaigns, builds the boards (lib/maintenance/board.ts), and writes campaigns
// and reviews. Anyone can look; admins create campaigns and mark reviews.

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { campaignBoards, reviewQueue, unitBoard } from "@/lib/maintenance/board";
import { MaintenanceView, type MaintTab } from "./MaintenanceView";
import { useMaintenanceData } from "./useMaintenanceData";

export default function MaintenanceModal({ open, onClose, companyId, isAdmin }: { open: boolean; onClose: () => void; companyId: string; isAdmin: boolean }) {
  const d = useMaintenanceData(companyId, open);
  const { members } = useCompanyRoster(open ? companyId : null);
  const [tab, setTab] = useState<MaintTab>("units");
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Driver";

  const units = useMemo(() => unitBoard({ units: d.units, types: d.types, records: d.records, permits: d.permits, inspections: d.inspections }), [d.units, d.types, d.records, d.permits, d.inspections]);
  const campaigns = useMemo(() => campaignBoards(d.campaigns, d.units, d.inspections), [d.campaigns, d.units, d.inspections]);
  const review = useMemo(() => reviewQueue(d.inspections).map((i) => ({ ...i, unitName: `${i.kind === "truck" ? "Truck" : "Trailer"} ${d.units.find((u) => u.id === i.unitId)?.name ?? ""}` })), [d.inspections, d.units]);
  const regions = useMemo(() => [...new Set(d.units.map((u) => u.region).filter(Boolean))].sort() as string[], [d.units]);

  return (
    <FullscreenModal open={open} title="Maintenance" onClose={onClose} footer={null}>
      <MaintenanceView
        tab={tab} onTab={setTab} units={units} campaigns={campaigns} review={review} driverName={nameOf} loading={d.loading} error={d.error}
        canEdit={isAdmin} regions={regions}
        onCreateCampaign={async (c) => {
          const { data: u } = await supabase.auth.getUser();
          await supabase.from("inspection_campaigns").insert({ company_id: companyId, name: c.name.trim(), unit_kind: c.unit_kind, region: c.region || null, due_on: c.due_on || null, created_by: u.user?.id ?? null });
          await d.reload();
        }}
        onCloseCampaign={async (id) => { await supabase.from("inspection_campaigns").update({ closed_at: new Date().toISOString() }).eq("campaign_id", id); await d.reload(); }}
        onReview={async (id) => {
          const { data: u } = await supabase.auth.getUser();
          await supabase.from("unit_inspections").update({ review_status: "reviewed", reviewed_by: u.user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("inspection_id", id);
          await d.reload();
        }}
      />
    </FullscreenModal>
  );
}
