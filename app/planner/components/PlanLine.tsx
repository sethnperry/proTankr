"use client";
// app/planner/components/PlanLine.tsx
//
// One plan on one line, the same everywhere a plan is picked: "Plan A: D2/--/D2" (product code per compartment,
// highest comp first like the trip card, "--" for an empty one) and, where there is room, the detail after it:
// "(C3=ULSD #2, C2=Empty, C1=ULSD #2)".

import React from "react";

export type PlanLineComp = { num: number; code: string | null; name: string | null; color: string | null };

const MUTED = "rgba(255,255,255,0.45)";

export function PlanLine({ letter, comps, active, detail = true }: { letter: string; comps: PlanLineComp[]; active?: boolean; detail?: boolean }) {
  return (
    <span className="dash-num" style={{ minWidth: 0, display: "block", fontSize: 14, lineHeight: 1.35 }}>
      {letter && <><span style={{ fontWeight: 800, color: active ? "#fff" : "rgba(255,255,255,0.7)" }}>Plan {letter}:</span>{" "}</>}
      {comps.map((c, i) => (
        <React.Fragment key={c.num}>
          {i > 0 && <span style={{ color: MUTED }}>/</span>}
          <span style={{ fontWeight: 800, color: c.code ? c.color ?? "#fff" : MUTED }}>{c.code ?? "--"}</span>
        </React.Fragment>
      ))}
      {detail && comps.length > 0 && (
        <span style={{ color: MUTED, fontSize: 12 }}>{" "}({comps.map((c) => `C${c.num}=${c.code ? c.name ?? c.code : "Empty"}`).join(", ")})</span>
      )}
    </span>
  );
}
