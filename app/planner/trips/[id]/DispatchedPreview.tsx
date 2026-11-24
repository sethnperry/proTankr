"use client";
// app/planner/trips/[id]/DispatchedPreview.tsx
//
// A dispatched (not yet begun) load on its own page: the shared card, which opens the trip's details for editing. There is
// no way to begin it from here; only the dashboard's button begins a trip.

import React from "react";
import { useRouter } from "next/navigation";
import { DispatchedTripCard } from "@/app/planner/components/trip/DispatchedTripCard";
import type { TripDeliveryRow, TripPickupRow, TripRow } from "@/lib/trips/types";

export function DispatchedPreview({
  trip, pickups, deliveries, locNames, onBack,
}: {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  locNames: Record<string, string>;
  products?: unknown;
  onBack: () => void;
}) {
  const router = useRouter();
  const edit = () => {
    try { window.sessionStorage.setItem("proTankr:editDispatched", trip.trip_id); } catch { /* the query carries it too */ }
    router.push(`/planner/home?edit=${trip.trip_id}`);
  };
  return (
    <div style={{ padding: 16, paddingBottom: 40, maxWidth: 640, margin: "0 auto" }}>
      <button type="button" onClick={onBack}
        style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 12 }}>‹ Back</button>
      <DispatchedTripCard trip={trip} pickups={pickups} deliveries={deliveries} locNames={locNames} onOpen={edit} />
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.4 }}>Tap the load to see and edit its details. Only the dashboard begins a trip.</div>
    </div>
  );
}
