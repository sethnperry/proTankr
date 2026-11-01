"use client";
// app/planner/trips/page.tsx
//
// The driver's trips, newest first (their own, whatever truck or place), each opening its Product Transfer
// Document (docs/trip-workflow-design.md §13). The list itself is the shared TripsBrowser.

import React from "react";
import { useCalculatorShell } from "../CalculatorShellContext";
import { TripsBrowser } from "../components/trip/TripsBrowser";
import { usePending } from "@/lib/ui/pending";

export default function TripsPage() {
  const nav = usePending();
  const shell = useCalculatorShell();
  return (
    <div style={{ padding: 16, paddingBottom: 40, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Trips & PTDs</div>
        <button type="button" onClick={() => nav.go("blank", "/planner/trips/blank")} aria-busy={nav.is("blank")}
          style={{ border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", borderRadius: 2, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Blank PTD
        </button>
      </div>
      <TripsBrowser mode="driver" userId={shell.effectiveUserId || null} />
    </div>
  );
}
