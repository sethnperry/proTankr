"use client";
// lib/ui/driver/InviteNameField.tsx
//
// The driver's name on an invite. The name has to match Geotab for hours of service
// and live tracking to link, so while the admin types it we check it against the
// company's Geotab drivers: a small blue "Verified in Geotab" when it matches, or
// the spelling Geotab has when it is close.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Check = { connected: boolean; verified: boolean; geotabName: string | null; close: string[] } | null;

export function InviteNameField({ companyId, value, onChange, inputStyle }: {
  companyId: string; value: string; onChange: (v: string) => void; inputStyle?: React.CSSProperties;
}) {
  const [check, setCheck] = useState<Check>(null);
  useEffect(() => {
    setCheck(null);
    const v = value.trim();
    if (v.length < 3) return;
    let off = false;
    const t = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const r = await fetch(`/api/telematics/verify-name?companyId=${encodeURIComponent(companyId)}&name=${encodeURIComponent(v)}`, {
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store",
        });
        if (!r.ok || off) return;
        setCheck(await r.json());
      } catch { /* no check, no badge */ }
    }, 500);
    return () => { off = true; window.clearTimeout(t); };
  }, [value, companyId]);

  const blue = "#60a5fa";
  return (
    <div>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="First and last name" autoComplete="off" style={inputStyle} />
      {check?.connected && check.verified && (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: blue, display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="10" fill={blue} /><path d="M7 12.5l3.2 3.2L17 9" stroke="#0b0b0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Verified in Geotab{check.geotabName && check.geotabName !== value.trim() ? `: ${check.geotabName}` : ""}
        </div>
      )}
      {check?.connected && !check.verified && check.close.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#fbbf24" }}>
          Not an exact match. Geotab has{" "}
          {check.close.map((n, i) => (
            <button key={n} type="button" onClick={() => onChange(n)} style={{ background: "none", border: "none", padding: 0, color: "#fbbf24", fontWeight: 800, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>
              {n}{i < check.close.length - 1 ? ", " : ""}
            </button>
          ))}
          . Tap to use it.
        </div>
      )}
      {check?.connected && !check.verified && check.close.length === 0 && value.trim().length >= 3 && (
        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>Not found in Geotab. Hours and tracking link by name.</div>
      )}
    </div>
  );
}
