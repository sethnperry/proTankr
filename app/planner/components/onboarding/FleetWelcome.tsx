"use client";
// app/planner/components/onboarding/FleetWelcome.tsx
//
// First screen for an invited fleet driver: their name. The invite only
// carries an email, so without this the driver shows up as a blank or
// "Driver" to dispatch, on the load board and on every PTD.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { PRIMARY_BTN } from "@/lib/ui/look";

export function FleetWelcome({ userId, companyId, companyName, onDone }: {
  userId: string; companyId: string; companyName: string | null; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  // Portaled to <body> (like SetupGate): the Plan page's own container is hidden on other screens.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    const v = name.trim();
    if (v.length < 2) return setErr("Enter your first and last name.");
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("upsert_driver_profile", { p_user_id: userId, p_company_id: companyId, p_data: { display_name: v } });
    setBusy(false);
    if (error) return setErr("Couldn't save your name. Check your connection and try again.");
    onDone();
  };
  if (!mounted) return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#111111", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>Welcome</div>
        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, lineHeight: 1.2 }}>{companyName ? `You've been added to ${companyName}` : "You've been added to your fleet"}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.5 }}>
          Two quick steps: your name, then the truck and trailer you're running. Dispatch sees this name on your loads.
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          style={{ marginTop: 22, width: "100%", boxSizing: "border-box", padding: "14px 12px", fontSize: 18, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2, outline: "none" }} />
        {err && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: "#f87171" }}>{err}</div>}
        <button type="button" onClick={() => void save()} disabled={busy} aria-busy={busy}
          style={{ ...PRIMARY_BTN, marginTop: 16, width: "100%", padding: "15px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 } as React.CSSProperties}>
          Continue
        </button>
      </div>
    </div>,
    document.body,
  );
}
