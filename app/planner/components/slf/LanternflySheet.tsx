"use client";
// app/planner/components/slf/LanternflySheet.tsx
//
// Spotted Lanternfly: for each quarantine-zone county the trip entered, the driver checks the cab exterior, the
// frame rails and tool box, and the trailer, then attests. All three must be checked. Presentational.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { attestProblem, type Checks, type CountyEntry } from "@/lib/slf/slf";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const ITEMS: { key: keyof Checks; label: string }[] = [{ key: "cab", label: "Cab exterior" }, { key: "frame", label: "Frame rails and tool box" }, { key: "trailer", label: "Trailer" }];

export function LanternflySheet({ open, onClose, missing, attested, hasTrip, hasZone, onAttest }: {
  open: boolean; onClose: () => void; missing: CountyEntry[]; attested: CountyEntry[]; hasTrip: boolean; hasZone: boolean; onAttest: (e: CountyEntry) => void;
}) {
  const [checks, setChecks] = useState<Record<string, Checks>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setChecks({}); setErr(null); } }, [open]);
  const of = (k: string): Checks => checks[k] ?? { cab: false, frame: false, trailer: false };

  return (
    <FullscreenModal open={open} title="Spotted Lanternfly" onClose={onClose} footer={null}>
      {!hasTrip && <div style={{ color: MUTE, fontSize: 15 }}>Start a trip first. Counties are checked from the stops on your trip.</div>}
      {hasTrip && !hasZone && <div style={{ color: MUTE, fontSize: 15 }}>Your company hasn't set any Spotted Lanternfly counties.</div>}
      {hasTrip && hasZone && missing.length === 0 && attested.length === 0 && <div style={{ color: MUTE, fontSize: 15 }}>Nothing needed. This trip hasn't entered a quarantine county.</div>}
      {missing.map((e) => {
        const c = of(e.key);
        return (
          <div key={e.key} style={{ border: "1px solid rgba(251,191,36,0.55)", background: "#0f0f10", padding: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{e.county}, {e.state}</div>
            <div style={{ fontSize: 13, color: MUTE, marginBottom: 10 }}>Entered at {e.firstStop}. Check each, then attest.</div>
            {ITEMS.map((it) => (
              <button key={it.key} type="button" onClick={() => setChecks((m) => ({ ...m, [e.key]: { ...c, [it.key]: !c[it.key] } }))}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px", marginBottom: 6, textAlign: "left", cursor: "pointer", color: "#fff", border: `1px solid ${c[it.key] ? "#4ade80" : HAIR}`, background: c[it.key] ? "rgba(74,222,128,0.12)" : "#0a0a0b", fontSize: 15, fontWeight: 700 }}>
                <span aria-hidden style={{ width: 20, height: 20, border: `1px solid ${c[it.key] ? "#4ade80" : MUTE}`, background: c[it.key] ? "#4ade80" : "transparent", color: "#000", fontSize: 14, textAlign: "center", lineHeight: "18px", flexShrink: 0 }}>{c[it.key] ? "✓" : ""}</span>
                {it.label}
              </button>
            ))}
            {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 6 }}>{err}</div>}
            <button type="button" onClick={() => { const p = attestProblem(c); if (p) { setErr(p); return; } setErr(null); onAttest(e); }}
              style={{ width: "100%", marginTop: 4, padding: "14px 0", fontSize: 14, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>I inspected it</button>
          </div>
        );
      })}
      {attested.map((e) => <div key={e.key} style={{ padding: "10px 0", borderTop: `1px solid ${HAIR}`, fontSize: 14 }}><b>{e.county}, {e.state}</b> <span style={{ color: "#4ade80" }}>✓ attested</span></div>)}
    </FullscreenModal>
  );
}
