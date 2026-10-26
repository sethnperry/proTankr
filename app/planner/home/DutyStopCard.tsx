"use client";
// app/planner/home/DutyStopCard.tsx
//
// "Your log changed at 10:42" -- asked after the fact, from Geotab's own
// timestamp, so nothing is typed and a stop in a dead zone still gets its real
// time once the truck's logs reach us.

import React, { useState } from "react";
import { DELAY_REASONS, LEG_LABEL, OTHER_CODE, type DelayLeg } from "@/lib/trips/delays";
import { DUTY_NAME } from "@/lib/trips/stopPrompt";
import { LOOK } from "./dashLook";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function DutyStopCard({ stop, targetName, leg, onArrived, onDelay, onDismiss }: {
  stop: { at: string; code: string; resumedAt: string | null }; targetName: string; leg: DelayLeg;
  onArrived: () => void; onDelay: (code: string, note: string | null) => void; onDismiss: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const btn: React.CSSProperties = { padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 };
  return (
    <div style={{ ...LOOK.primary, padding: 14, marginBottom: 10, borderColor: "rgba(147,197,253,0.5)" }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>You stopped driving at {hm(stop.at)}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
        Your log changed to {DUTY_NAME[stop.code] ?? stop.code}{stop.resumedAt ? ` and you were driving again at ${hm(stop.resumedAt)}` : ""}. Was that {targetName}, or a delay?
      </div>
      {!picking ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="dash-press" onClick={onArrived} style={{ flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", ...LOOK.cta }}>Arrived · {hm(stop.at)}</button>
          <button type="button" className="dash-press" onClick={() => setPicking(true)} style={{ ...btn, flex: 1 }}>A delay</button>
          <button type="button" onClick={onDismiss} style={{ ...btn, flex: 1 }}>Neither</button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{LEG_LABEL[leg]} · why?</div>
          {[...DELAY_REASONS[leg], { code: OTHER_CODE, label: "Other" }].map((r) => (
            <button key={r.code} type="button" className="dash-press" onClick={() => onDelay(r.code, null)} style={{ ...btn, width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6 }}>{r.label}</button>
          ))}
          <button type="button" onClick={() => setPicking(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer", padding: 0 }}>‹ Back</button>
        </div>
      )}
    </div>
  );
}
