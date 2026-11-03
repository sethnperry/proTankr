"use client";
// app/profile/page.tsx
//
// Profile: your details, plus the personal things that used to live in the menu: Credentials,
// Badges, Settings and Learn.

import React, { useState } from "react";
import Link from "next/link";
import { css } from "@/lib/ui/driver/tokens";
import { SelfProfileView } from "@/lib/ui/driver/SelfProfileView";
import SettingsModal from "@/lib/ui/driver/SettingsModal";
import { useDashIdentity } from "@/lib/ui/driver/useDashIdentity";
import { BackToDashboard } from "@/app/planner/components/dash/BackToDashboard";
import { DashStyles, useDashLook } from "@/app/planner/home/dashLook";

export default function ProfilePage() {
  const L = useDashLook();
  const id = useDashIdentity();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const row: React.CSSProperties = { ...L.secondary, display: "flex", alignItems: "center", width: "100%", padding: "14px", marginBottom: 8, color: "#fff", fontSize: 15, fontWeight: 800, textAlign: "left", cursor: "pointer", textDecoration: "none" };
  return (
    <div style={css.page}>
      <DashStyles />
      <BackToDashboard />
      <div style={{ marginBottom: 20, marginTop: 6 }}>
        <h1 style={css.heading}>Profile</h1>
        <p style={css.subheading}>Your personal details.</p>
      </div>

      <SelfProfileView />

      <div style={{ ...L.sectionLabel, marginTop: 28 }}>More</div>
      <Link href="/planner/setup" className="dash-press" style={row}><span style={{ flex: 1 }}>Setup</span><span style={{ color: L.faint }}>›</span></Link>
      <Link href="/planner/vault" className="dash-press" style={row}><span style={{ flex: 1 }}>Vault</span><span style={{ color: L.faint }}>›</span></Link>
      <Link href="/planner/cards/credentials" className="dash-press" style={row}><span style={{ flex: 1 }}>Credentials</span><span style={{ color: L.faint }}>›</span></Link>
      <Link href="/planner/cards/badges" className="dash-press" style={row}><span style={{ flex: 1 }}>Badges</span><span style={{ color: L.faint }}>›</span></Link>
      {id.companyId && (
        <button type="button" className="dash-press" style={row} onClick={() => setSettingsOpen(true)}><span style={{ flex: 1 }}>Settings</span><span style={{ color: L.faint }}>›</span></button>
      )}
      <Link href="/learn" className="dash-press" style={row}><span style={{ flex: 1 }}>Learn</span><span style={{ color: L.faint }}>›</span></Link>

      {id.companyId && id.userId && (
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} companyId={id.companyId} myRole={id.role ?? "driver"} authUserId={id.userId} />
      )}
    </div>
  );
}
