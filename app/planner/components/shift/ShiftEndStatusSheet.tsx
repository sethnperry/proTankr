"use client";
// app/planner/components/shift/ShiftEndStatusSheet.tsx
//
// After End shift, when nobody set the truck's status during the shift: what status does it get? A sleeper can stay
// In use; a truck with product aboard offers Park preloaded instead of Readyline. Presentational: the caller applies the
// choice. Options come from lib/shifts/endStatus.ts.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";
import type { EndStatusChoice, EndStatusOption } from "@/lib/shifts/endStatus";

export function ShiftEndStatusSheet({ open, truckName, options, onChoose, onKeep }: {
  open: boolean; truckName: string; options: EndStatusOption[];
  onChoose: (c: EndStatusChoice) => Promise<string | null>; onKeep: () => void;
}) {
  const L = useDashLook();
  const [busy, setBusy] = useState<EndStatusChoice | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (c: EndStatusChoice) => { setBusy(c); setErr(null); const e = await onChoose(c); setBusy(null); if (e) setErr(e); };
  return (
    <FullscreenModal open={open} title={`${truckName || "Truck"} · status`} onClose={onKeep} footer={null}>
      <div style={{ color: L.muted, fontSize: 14, marginBottom: 14 }}>Shift ended. What status should the truck have?</div>
      {options.map((o) => (
        <button key={o.value} type="button" disabled={!!busy} onClick={() => void pick(o.value)} className="dash-press"
          style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", padding: "16px 14px", marginBottom: 8, color: "#fff", cursor: "pointer", opacity: busy && busy !== o.value ? 0.5 : 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{busy === o.value ? "Saving…" : o.label}</div>
          <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{o.hint}</div>
        </button>
      ))}
      {err && <div style={{ color: "#f87171", fontSize: 13, margin: "8px 0" }}>{err}</div>}
      <button type="button" onClick={onKeep} style={{ width: "100%", marginTop: 6, padding: "12px 0", background: "none", border: "none", color: L.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>Keep it as it is</button>
    </FullscreenModal>
  );
}
