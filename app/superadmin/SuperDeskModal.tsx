"use client";
// app/superadmin/SuperDeskModal.tsx
//
// ProTankr Dashboard → Desk: the same inbox, stuck-sync list and driver timeline as a company's Desk, across every
// company. Super admins only (the page already gates this). The rules are in lib/desk/desk.ts.

import React, { useMemo } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { startSetupSession } from "@/lib/setupSession";
import { groupErrors, stuckList } from "@/lib/desk/desk";
import { DeskView } from "@/app/admin/DeskView";
import { useDesk } from "@/app/admin/useDesk";

export default function SuperDeskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const desk = useDesk({ companyId: null, allCompanies: true, enabled: open });
  const nameOf = (id: string) => desk.people.get(id)?.name ?? "Driver";
  const groups = useMemo(() => groupErrors(desk.rows, nameOf, Date.now()), [desk.rows, desk.people]); // eslint-disable-line react-hooks/exhaustive-deps
  const stuck = useMemo(() => stuckList(desk.rows, nameOf, Date.now()), [desk.rows, desk.people]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FullscreenModal open={open} title="Desk · all companies" onClose={onClose} footer={null}>
      <DeskView groups={groups} stuck={stuck} canResolve canUseAs loading={desk.loading} error={desk.error}
        companyName={(id) => (id ? desk.companies.get(id) ?? null : null)}
        onResolve={desk.resolve}
        onRetry={async (i) => (i.retry ? desk.retry(i.id, i.retry) : null)}
        onUseAs={async (userId, name) => {
          const { data } = await supabase.auth.getUser();
          startSetupSession({ targetUserId: userId, targetDisplayName: name, adminUserId: data.user?.id ?? "", returnTo: "/superadmin" });
          window.location.href = "/planner";
        }}
        loadTimeline={desk.loadTimeline} />
    </FullscreenModal>
  );
}
