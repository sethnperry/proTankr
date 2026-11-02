"use client";
// app/planner/components/dash/ConnectedDash.tsx
//
// The shared dashboard header and footer wired to the signed-in identity. Each dashboard just
// drops these in; the data hook lives here so the views stay presentational.

import React from "react";
import { useDashIdentity } from "@/lib/ui/driver/useDashIdentity";
import { reachableDashboards, SHARED_TOOLS, type DashboardId } from "@/lib/ui/driver/dashboards";
import { ToolPanel, type ToolItem } from "@/app/planner/home/DashboardChrome";
import { usePending } from "@/lib/ui/pending";
import { DashHeader } from "./DashHeader";
import { DashFooter } from "./DashFooter";

export function ConnectedDashHeader({ current, line, right }: { current: DashboardId; line?: React.ReactNode; right?: React.ReactNode }) {
  const id = useDashIdentity();
  const dashboards = reachableDashboards(id.role, id.isSuperAdmin, id.isSolo);
  return (
    <DashHeader current={current} dashboards={dashboards} memberships={id.memberships} activeCompanyId={id.companyId}
      switching={id.switching} onSwitchCompany={(c) => void id.switchCompany(c)}
      line={line ?? id.companyName} right={right} showCompanies={!id.isSuperAdmin} />
  );
}

export function ConnectedDashFooter() {
  const id = useDashIdentity();
  return <DashFooter name={id.name} role={id.role} isSuperAdmin={id.isSuperAdmin} onSignOut={() => void id.signOut()} />;
}

/** Vault and Reports as tool items, for dashboards that build their own tool list. */
export function useSharedToolItems(): ToolItem[] {
  const nav = usePending();
  return SHARED_TOOLS.map((t) => ({ icon: t.icon, label: t.label, sub: t.sub, onClick: () => nav.go(t.id, t.href), busy: nav.is(t.id) }) as ToolItem);
}

/** Vault and Reports, the two tiles every dashboard carries. Pass a dashboard's own tools in `extra`. */
export function SharedToolsPanel({ extra = [] }: { extra?: ToolItem[] }) {
  const shared = useSharedToolItems();
  return <ToolPanel items={[...extra, ...shared]} />;
}
