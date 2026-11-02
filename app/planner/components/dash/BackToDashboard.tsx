"use client";
// app/planner/components/dash/BackToDashboard.tsx
//
// "‹ Dashboard" row for pages that sit outside the dashboards (Reports, Trips, Vault, Planner,
// Profile). Goes to the first dashboard this person can reach.

import React from "react";
import Link from "next/link";
import { useDashIdentity } from "@/lib/ui/driver/useDashIdentity";
import { homeDashboardHref } from "@/lib/ui/driver/dashboards";

export function BackToDashboard({ style, compact }: { style?: React.CSSProperties; compact?: boolean }) {
  const id = useDashIdentity();
  const href = id.ready ? homeDashboardHref(id.role, id.isSuperAdmin, id.isSolo) : "/planner/home";
  return (
    <Link href={href} aria-label="Dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", textDecoration: "none", padding: "6px 0", ...style }}>
      <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>‹</span>{compact ? <span style={{ fontSize: 0 }}>Dashboard</span> : " Dashboard"}
    </Link>
  );
}
