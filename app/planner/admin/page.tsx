"use client";
// app/planner/admin/page.tsx
//
// Role-specific tab shown left of Planner for admin-role users (and to
// super admins, who see every role tab -- see CalculatorLayoutClient.tsx).
// This is DELIBERATELY separate from the existing full company-management
// console at /admin (app/admin/page.tsx, users/equipment/terminals/fleet
// cards/incentives/payroll) -- this is the same lightweight "tab within
// the driver-app shell" shape as Lead/Dispatch (subtabs + content area),
// not a replacement for that page. No specific Dashboard content has been
// specified yet, so all three subtabs are honest placeholders for now.

import React, { useState } from "react";
import CenteredSubTabs, { type CenteredSubTab } from "../components/CenteredSubTabs";

const SUBTABS: CenteredSubTab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tasks", label: "Tasks" },
  { id: "ledger", label: "Ledger" },
];

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "28px 18px", textAlign: "center" as const }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

export default function CalculatorAdminPage() {
  const [activeSubTab, setActiveSubTab] = useState("dashboard");

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <CenteredSubTabs tabs={SUBTABS} activeId={activeSubTab} onChange={setActiveSubTab} />
      </div>

      {activeSubTab === "dashboard" && (
        <PlaceholderPanel
          title="Dashboard"
          note="Coming soon -- likely a company-wide status overview. The full management console (equipment, terminals, incentives, payroll) stays at /admin -- this is a lighter fleet-glance view."
        />
      )}
      {activeSubTab === "tasks" && (
        <PlaceholderPanel
          title="Tasks"
          note="Coming soon -- content not yet specified."
        />
      )}
      {activeSubTab === "ledger" && (
        <PlaceholderPanel
          title="Ledger"
          note="Coming soon -- content not yet specified."
        />
      )}
    </div>
  );
}
