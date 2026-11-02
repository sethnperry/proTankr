"use client";
// app/planner/components/dash/DashHeader.tsx
//
// The top of every dashboard: a small uppercase title with a down arrow, a line under it, and the
// dashboard's own controls (mode switch, region filter) on the right. Tapping the title opens a
// sheet that lists the dashboards you can reach and, if you belong to more than one company, the
// companies. Replaces the hamburger menu. Presentational: all data comes in as props.

import React, { useState } from "react";
import Link from "next/link";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";
import { DASHBOARD_TITLES, type DashboardId, type DashboardLink } from "@/lib/ui/driver/dashboards";
import { ROLE_LABELS, type Role } from "@/lib/ui/driver/role";
import type { DashMembership } from "@/lib/ui/driver/useDashIdentity";

export type DashHeaderProps = {
  current: DashboardId;
  dashboards: DashboardLink[];
  memberships: DashMembership[];
  activeCompanyId: string;
  switching: boolean;
  onSwitchCompany: (id: string) => void;
  /** Shown under the title: company name, driver name, truck number... */
  line?: React.ReactNode;
  /** Right side: mode switch, region filter. */
  right?: React.ReactNode;
  showCompanies?: boolean;
};

export function DashHeader(p: DashHeaderProps) {
  const L = useDashLook();
  const [open, setOpen] = useState(false);
  const many = p.dashboards.length > 1 || (p.showCompanies !== false && p.memberships.length > 1);
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button type="button" className="dash-press" onClick={() => many && setOpen(true)} aria-label="Switch dashboard"
            style={{ ...L.title, background: "none", border: "none", padding: 0, color: "#fff", cursor: many ? "pointer" : "default", textAlign: "left" }}>
            {DASHBOARD_TITLES[p.current]}{many && <span style={{ color: L.muted, marginLeft: 6 }}>▾</span>}
          </button>
          {p.line != null && <div className="dash-num" style={{ fontSize: 18, fontWeight: 700, color: L.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.line}</div>}
        </div>
        {p.right && <div className="dash-hright" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 0 }}>{p.right}</div>}
        <style>{`@media (max-width: 640px){.dash-hright{flex-direction:column;align-items:flex-end !important;gap:6px !important}}`}</style>
      </div>

      <FullscreenModal open={open} title="Switch" onClose={() => setOpen(false)} footer={null}>
        <DashSwitchList {...p} onDone={() => setOpen(false)} />
      </FullscreenModal>
    </>
  );
}

function DashSwitchList(p: DashHeaderProps & { onDone: () => void }) {
  const L = useDashLook();
  const row: React.CSSProperties = { ...L.secondary, display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 14px", marginBottom: 8, color: "#fff", fontSize: 15, fontWeight: 800, textAlign: "left", cursor: "pointer", textDecoration: "none" };
  return (
    <>
      <div style={{ ...L.sectionLabel, marginTop: 0 }}>Dashboards</div>
      {p.dashboards.map((d) => (
        <Link key={d.id} href={d.href} onClick={() => d.id === p.current && p.onDone()} className="dash-press"
          style={{ ...row, borderColor: d.id === p.current ? "#fff" : undefined }}>
          <span style={{ flex: 1 }}>{d.label}</span>
          {d.id === p.current ? <span style={{ fontSize: 11, color: L.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>Here</span> : <span style={{ color: L.faint }}>›</span>}
        </Link>
      ))}
      {p.showCompanies !== false && p.memberships.length > 1 && (
        <>
          <div style={L.sectionLabel}>Company</div>
          {p.memberships.map((m) => {
            const on = m.company_id === p.activeCompanyId;
            return (
              <button key={m.company_id} type="button" className="dash-press" disabled={p.switching} onClick={() => p.onSwitchCompany(m.company_id)}
                style={{ ...row, borderColor: on ? "#fff" : undefined, cursor: p.switching ? "wait" : "pointer" }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.company?.company_name ?? "Company"}</span>
                <span style={{ fontSize: 11, color: L.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>{ROLE_LABELS[m.role as Role] ?? m.role}</span>
              </button>
            );
          })}
        </>
      )}
    </>
  );
}
