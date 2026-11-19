"use client";
// app/planner/dispatch/DispatchTypeSheet.tsx
//
// The Dispatch tile's first window: what are you sending, an Empty move or a Loaded one. Empty opens the empty move
// wizard; Loaded asks which driver, then opens Plan Trip for them.

import { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { RADIUS } from "@/lib/ui/look";

const hair = "rgba(255,255,255,0.14)", muted = "rgba(255,255,255,0.5)";
const big: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "18px 16px", marginBottom: 10, fontSize: 18, fontWeight: 800, background: "#121213", color: "#fff", border: `1px solid ${hair}`, borderRadius: RADIUS, cursor: "pointer" };

export function DispatchTypeSheet({ open, onClose, drivers, onEmpty, onLoaded }: {
  open: boolean; onClose: () => void; drivers: { id: string; name: string }[];
  onEmpty: () => void; onLoaded: (driverId: string) => void;
}) {
  const [step, setStep] = useState<"type" | "driver">("type");
  const [q, setQ] = useState("");
  useEffect(() => { if (open) { setStep("type"); setQ(""); } }, [open]);
  const s = q.trim().toLowerCase();
  return (
    <FullscreenModal open={open} title={step === "type" ? "Dispatch" : "Which driver?"} onClose={step === "driver" ? () => setStep("type") : onClose} footer={null}>
      {step === "type" ? (
        <>
          <button type="button" className="dash-press" style={big} onClick={onEmpty}>Empty<div style={{ fontSize: 13, fontWeight: 500, color: muted, marginTop: 4 }}>Bobtail, empty trailer, hook or drop. No load.</div></button>
          <button type="button" className="dash-press" style={big} onClick={() => setStep("driver")}>Loaded<div style={{ fontSize: 13, fontWeight: 500, color: muted, marginTop: 4 }}>Plan a trip: rack, supplier, store, plan.</div></button>
        </>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers" style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${hair}`, color: "#fff", fontSize: 15, padding: "10px 12px", borderRadius: RADIUS, marginBottom: 10 }} />
          {drivers.filter((d) => !s || d.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
            <button key={d.id} type="button" style={{ ...big, padding: "13px 14px", fontSize: 15, fontWeight: 700 }} onClick={() => onLoaded(d.id)}>{d.name}</button>
          ))}
        </>
      )}
    </FullscreenModal>
  );
}
