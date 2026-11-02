"use client";
// app/planner/components/dash/DashFooter.tsx
//
// The bottom of every dashboard: who you are, your role, Profile and Sign out.

import React from "react";
import Link from "next/link";
import { useDashLook } from "@/app/planner/home/dashLook";
import { ROLE_LABELS, type Role } from "@/lib/ui/driver/role";

export function DashFooter({ name, role, isSuperAdmin, onSignOut }: { name: string; role: Role | null; isSuperAdmin: boolean; onSignOut: () => void }) {
  const L = useDashLook();
  const btn: React.CSSProperties = { ...L.secondary, flex: 1, textAlign: "center", color: "#fff", padding: "13px 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", textDecoration: "none" };
  const roleText = isSuperAdmin ? "ProTankr admin" : role ? ROLE_LABELS[role] : "";
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ ...L.sectionLabel, margin: "0 0 10px" }}>
        {name || "Signed in"}{roleText ? ` · ${roleText}` : ""}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Link href="/profile" className="dash-press" style={btn}>Profile</Link>
        <button type="button" className="dash-press" onClick={onSignOut} style={{ ...btn, color: "#f87171" }}>Sign out</button>
      </div>
    </div>
  );
}
