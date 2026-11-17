"use client";
// app/planner/home/homeShared.tsx
//
// Module-level pieces of the Driver Dashboard that both the logic (useHome) and the screen (HomeView) use.

// app/planner/home/page.tsx
//
// Driver dashboard (trip workflow phase 2, docs/trip-workflow-design.md §9 and
// §14): where the driver's trip stands, one big button for the next step, and
// the everyday tools underneath.
//
// Everything about the trip is local-first: Start Load writes to the offline
// trip store (lib/trips) and syncs in the background, so a driver with no
// signal at the terminal still gets a working button.
//
// The big button walks the trip: Begin Trip → Arrived → (Planner) → Loaded →
// Arrived → Finish Delivery. The load itself is begun in the Planner, which
// attaches it to this trip (useLoadWorkflow -> linkLoadToOpenTrip).

import React, { useEffect, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

import type { TripTable } from "@/lib/trips/types";

import type { TripDeliveryRow, TripRow } from "@/lib/trips/types";

import { setEquipmentTools } from "@/lib/ui/equipmentTools";

// Sheets that only open on a tap load after the page is up, not before it can draw.
import dynamic from "next/dynamic";

export const SquawkSheet = dynamic(() => import("../components/squawk/SquawkSheet").then((m) => m.SquawkSheet), { ssr: false });

export const DropSiteSheet = dynamic(() => import("../components/trip/DropSiteSheet").then((m) => m.DropSiteSheet), { ssr: false });

export const StartLoadSheet = dynamic(() => import("../components/StartLoadSheet").then((m) => m.StartLoadSheet), { ssr: false });

export const LoadedSheet = dynamic(() => import("../components/trip/LoadedSheet").then((m) => m.LoadedSheet), { ssr: false });

export const LocationPicker = dynamic(() => import("../components/trip/LocationPicker").then((m) => m.LocationPicker), { ssr: false });

export const AddPickupSheet = dynamic(() => import("../components/trip/AddPickupSheet").then((m) => m.AddPickupSheet), { ssr: false });

export const FreightSheet = dynamic(() => import("../components/freight/FreightSheet").then((m) => m.FreightSheet), { ssr: false });

export const EmptyMoveSheet = dynamic(() => import("../components/moves/EmptyMoveSheet").then((m) => m.EmptyMoveSheet), { ssr: false });

export const TankCheckSheet = dynamic(() => import("../components/trip/TankCheckSheet").then((m) => m.TankCheckSheet), { ssr: false });

export const PerDiemSheet = dynamic(() => import("../components/perdiem/PerDiemSheet").then((m) => m.PerDiemSheet), { ssr: false });

export const STATUS_LABEL: Record<TripRow["status"], string> = {
  dispatched: "Dispatched",
  draft: "Not loaded yet",
  loading: "Loading",
  in_transit: "In transit",
  delivering: "Delivering",
  parked: "Parked preloaded",
  complete: "Complete",
  cancelled: "Cancelled",
};

export const muted = "rgba(255,255,255,0.5)";

export const smallLink: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
};

export type PickerMode =
  | { mode: "add" }
  // Dashboard "Delivery Location": sets where this driver is headed. On a
  // trip it reroutes the next delivery (or adds one); otherwise it's kept
  // for the next Begin Trip.
  | { mode: "select" }
  | { mode: "split"; ids: string[]; from: string | null }
  | { mode: "reroute"; delivery: TripDeliveryRow };

export /** A small steering wheel: Geotab shows this driver behind the wheel of the truck. */
function WheelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Driver" style={{ flexShrink: 0, display: "block" }} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 14v7M10 11.2 3.5 9.5M14 11.2l6.5-1.7" />
    </svg>
  );
}

export /** The equipment numbers with the wheel in front on the same line, same height with or without it. */
function EquipLine({ wheel, label }: { wheel: boolean; label: React.ReactNode }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, lineHeight: "inherit" }}>
      {wheel && <WheelIcon />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{label}</span>
    </span>
  );
}

export /** Tells the Equipment modal what Inspect and Truck down do on this page (cleared when the page goes away). */
function EquipmentToolsRegistrar({ onInspect, onTruckDown }: { onInspect: () => void; onTruckDown: () => void }) {
  const a = useRef(onInspect); a.current = onInspect;
  const b = useRef(onTruckDown); b.current = onTruckDown;
  useEffect(() => { setEquipmentTools({ onInspect: () => a.current(), onTruckDown: () => b.current() }); return () => setEquipmentTools(null); }, []);
  return null;
}

export function InfoRow({ label, value, valueColor, onClick, last }: {
  label: string; value: string; valueColor?: string; onClick: () => void; last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="dash-press"
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 14px",
        border: "none", borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.06)",
        background: "transparent", color: "#fff", cursor: "pointer", textAlign: "left",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, flexShrink: 0, background: valueColor ?? "rgba(255,255,255,0.55)" }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: muted, width: 84, flexShrink: 0 }}>{label}</span>
      <span className="dash-num" style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: valueColor ?? "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
}

export const SYNC_TABLE_LABEL: Record<string, string> = {
  suppliers: "Supplier",
  trips: "Trip",
  trip_orders: "Order",
  trip_pickups: "Pickup",
  trip_deliveries: "Delivery",
  trip_delivery_tanks: "Tank reading",
  trip_compartment_loads: "Compartment",
  trip_events: "Trip history entry",
  compartment_readiness: "Compartment status",
};

export // What didn't save and why, with Retry (after a fix ships) and Discard.
function SyncDetailsSheet({ open, failed, queue, pendingCount, onRetry, onDiscard, onClose }: {
  open: boolean;
  failed: { table: TripTable; key: string; error: string; failedAt: number }[];
  queue: { table: TripTable; key: string; attempts: number; lastError: string | null }[];
  pendingCount: number;
  onRetry: () => void;
  onDiscard: (table: TripTable, key: string) => void;
  onClose: () => void;
}) {
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  return (
    <FullscreenModal open={open} title="Sync" onClose={onClose} footer={null}>
      {failed.length === 0 && pendingCount === 0 && (
        <div style={{ fontSize: 15, color: "#4ade80", fontWeight: 700, marginBottom: 12 }}>Everything is saved.</div>
      )}
      {pendingCount > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, color: muted, marginBottom: 8 }}>
            {pendingCount} change{pendingCount === 1 ? "" : "s"} waiting to send. They go up on their own.
          </div>
          {queue.map((q) => (
            <div key={`${q.table}|${q.key}`} style={{ padding: "8px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {SYNC_TABLE_LABEL[q.table] ?? q.table}
                {q.attempts > 0 && <span style={{ fontSize: 12, color: muted, fontWeight: 500 }}> · tried {q.attempts}×</span>}
              </div>
              {q.lastError && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 2, overflowWrap: "anywhere" }}>{q.lastError}</div>}
            </div>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <>
          <div style={{ fontSize: 14, color: muted, marginBottom: 10 }}>
            The server turned these down. They&apos;re still on this phone. Retry sends them again.
          </div>
          <button type="button" onClick={onRetry}
            style={{ width: "100%", padding: "14px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>
            Retry {failed.length === 1 ? "" : `all ${failed.length}`}
          </button>
          {failed.map((f) => {
            const id = `${f.table}|${f.key}`;
            return (
              <div key={id} style={{ padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 2, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{SYNC_TABLE_LABEL[f.table] ?? f.table}</span>
                  <span style={{ fontSize: 12, color: muted }}>
                    {new Date(f.failedAt).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#f87171", marginTop: 4, overflowWrap: "anywhere" }}>{f.error}</div>
                {confirmKey === id ? (
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: muted, flex: 1 }}>Discard this change for good?</span>
                    <button type="button" onClick={() => { onDiscard(f.table, f.key); setConfirmKey(null); }}
                      style={{ background: "#f87171", color: "#000", border: "none", borderRadius: 2, padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Discard</button>
                    <button type="button" onClick={() => setConfirmKey(null)}
                      style={{ background: "transparent", color: muted, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>Keep</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmKey(id)}
                    style={{ marginTop: 6, background: "transparent", border: "none", padding: 0, color: muted, fontSize: 12, cursor: "pointer" }}>Discard</button>
                )}
              </div>
            );
          })}
        </>
      )}
    </FullscreenModal>
  );
}
