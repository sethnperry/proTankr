"use client";
// app/planner/components/JoinFleetView.tsx
//
// Lets a solo-tier user redeem a fleet company's invite code and switch into
// it -- e.g. their employer buys the Fleet tier after they'd already been
// using ProTankr solo. Embedded as a view inside SettingsModal.tsx's Account
// section (only shown for solo companies), not a standalone route -- this is
// deliberately separate from app/join/JoinClient.tsx, which handles a
// different, already-working flow (admin-sent email invite links with a
// ?company= param, no code entry).
//
// Per explicit product decision: joining a fleet via code ABANDONS the old
// solo company entirely -- no equipment migration/reconciliation, no VIN
// matching. redeem_invite() only sets active_company_id if it was previously
// null, so a solo user (who already has one) needs an explicit
// set_active_company() follow-up call to actually switch -- confirmed via
// live pg_get_functiondef, not assumed.

import React, { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { linkMeToTelematics } from "@/lib/telematics/linkMe";

export default function JoinFleetView({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed) { setErr("Enter an invite code."); return; }
    setBusy(true);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("redeem_invite", { p_code: trimmed });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const companyId = row?.company_id;
      if (!companyId) throw new Error("Redeem succeeded but no company was returned.");

      const { error: activeErr } = await supabase.rpc("set_active_company", { p_company_id: companyId });
      if (activeErr) throw activeErr;

      void linkMeToTelematics(String(companyId));
      onJoined();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong. Check the code and try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
        Has your company set up a Fleet account? Enter the invite code they gave you to switch over.
        Your current solo account and its equipment stay as-is, but you won't be using them going forward.
      </div>

      {err && (
        <div style={{ padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.10)", color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>
          {err}
        </div>
      )}

      <div>
        <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
          Invite Code
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. ABCD1234"
          autoCapitalize="characters"
          disabled={busy}
          style={{
            width: "100%", boxSizing: "border-box" as const, padding: "12px 14px", borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
            color: "#fff", fontSize: 15, letterSpacing: 1,
          }}
        />
      </div>

      <button aria-busy={!!(busy)}
        type="button"
        onClick={submit}
        disabled={busy}
        style={{
          padding: "13px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)",
          background: busy ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.92)",
          color: busy ? "rgba(255,255,255,0.35)" : "#111",
          fontSize: 14, fontWeight: 800, cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "Joining…" : "Join Fleet"}
      </button>
    </div>
  );
}
