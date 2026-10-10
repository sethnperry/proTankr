"use client";
// app/planner/trips/blank/page.tsx
//
// A blank, printable Product Transfer Document (docs/trip-workflow-design.md
// §13) for a driver whose phone is dead or out of reach: print a few, keep
// them in the truck, fill them in by hand.

import React from "react";
import { useRouter } from "next/navigation";
import { BlankPtd, PrintPortal } from "../PtdDocument";

export default function BlankPtdPage() {
  const router = useRouter();
  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <button type="button" onClick={() => router.push("/planner/trips")}
          style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          ‹ Trips
        </button>
        <button type="button" onClick={() => window.print()}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          Print / Save PDF
        </button>
      </div>
      <div style={{ overflowX: "auto" }}><BlankPtd /></div>
      <PrintPortal><BlankPtd /></PrintPortal>
    </div>
  );
}
