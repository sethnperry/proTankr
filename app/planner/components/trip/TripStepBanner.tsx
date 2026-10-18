"use client";
// app/planner/components/trip/TripStepBanner.tsx
//
// A one-line reminder on the Planner when the driver's open trip is waiting on
// a dashboard step (Arrived, Loaded, Finish Delivery). Taps through to the
// Driver Dashboard. Hidden when there's no open trip, or the next step is the
// Planner itself.

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTripStore } from "@/lib/trips/useTripStore";
import { openTripForDriver } from "@/lib/trips/tripLogic";
import { nextStep, tripSnapshot } from "@/lib/trips/tripFlow";
import type { TripRow } from "@/lib/trips/types";

export function TripStepBanner({ userId }: { userId: string | null }) {
  const router = useRouter();
  const { state, store } = useTripStore(userId);
  const step = useMemo(() => {
    if (!store || !userId) return null;
    const trip = openTripForDriver(Object.values(state.rows.trips ?? {}) as TripRow[], userId);
    if (!trip) return null;
    return nextStep(trip, tripSnapshot(store, trip.trip_id));
  }, [store, userId, state]);

  if (!step || step.kind === "start" || step.kind === "planner") return null;
  return (
    <button
      type="button"
      onClick={() => router.push("/planner/home")}
      style={{
        display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", gap: 10,
        border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff",
        borderRadius: 2, padding: "8px 12px", marginTop: 8, cursor: "pointer", textAlign: "left",
      }}
    >
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>
        <b>Trip: {step.label}</b>
        {step.detail ? <span style={{ color: "rgba(255,255,255,0.55)" }}> · {step.detail}</span> : null}
      </span>
      <span style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", flexShrink: 0 }}>›</span>
    </button>
  );
}
