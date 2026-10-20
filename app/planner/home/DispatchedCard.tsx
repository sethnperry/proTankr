"use client";
// app/planner/home/DispatchedCard.tsx
//
// Loads dispatch has planned for this driver. The first one is the next to
// run; "Begin Dispatched Load" (the dashboard's big button) turns it into a
// normal trip. Shows what dispatch filled in so the driver types less.

import React from "react";
import type { TripRow } from "@/lib/trips/types";
import { useDashLook } from "./dashLook";

export type DispatchedItem = {
  trip: TripRow;
  order: string | null;
  terminal: string | null;
  place: string | null;
  supplier: string | null;
  delivery: string | null;
  plannedEquipment: string | null;
  equipmentDiffers: boolean;
};

const when = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
};

export function DispatchedCard({ items }: { items: DispatchedItem[] }) {
  const L = useDashLook();
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {items.map((it, i) => (
        <div key={it.trip.trip_id} style={{ ...L.primary, padding: "12px 14px", marginBottom: 8, borderColor: i === 0 ? "#93c5fd" : undefined, opacity: i === 0 ? 1 : 0.8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93c5fd" }}>
              Dispatched{items.length > 1 ? ` · load ${i + 1}` : ""}
            </span>
            <span className="dash-num" style={{ marginLeft: "auto", fontSize: 12, color: L.muted }}>{when(it.trip.planned_start_at)}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 6 }}>
            {it.terminal ?? "Terminal"}{it.place && <span style={{ fontWeight: 600, color: L.muted }}> · {it.place}</span>}
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>to {it.delivery ?? "delivery"}</div>
          <div className="dash-num" style={{ fontSize: 13, color: L.muted, marginTop: 6, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
            <span>Order {it.order ?? "to enter"}</span>
            {it.supplier && <span>Supplier {it.supplier}</span>}
          </div>
          {it.plannedEquipment && (
            <div style={{ fontSize: 12, marginTop: 6, color: it.equipmentDiffers ? "#fb923c" : L.muted }}>
              {it.equipmentDiffers ? "⚠ Dispatch planned " : "Planned "}{it.plannedEquipment}{it.equipmentDiffers ? ". You're on different equipment." : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
