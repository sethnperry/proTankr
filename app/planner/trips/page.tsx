"use client";
// app/planner/trips/page.tsx
//
// The driver's trips, newest first, each opening its Product Transfer
// Document (docs/trip-workflow-design.md §13). Local-first: trips on the
// phone show immediately, then the last 50 from the server are merged in.

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { pruneMissingTrips } from "@/lib/trips/pruneTrips";
import { useTripStore } from "@/lib/trips/useTripStore";
import { setTripHidden } from "@/lib/trips/tripFlow";
import { cancelReasonsText } from "@/lib/trips/cancelReasons";
import { ptdCode } from "@/lib/trips/code39";
import type { TripOrderRow, TripRow } from "@/lib/trips/types";
import { fmtDateTime } from "./PtdDocument";

import { usePending } from "@/lib/ui/pending";
const STATUS: Record<TripRow["status"], { label: string; color: string }> = {
  draft: { label: "Not loaded", color: "rgba(255,255,255,0.5)" },
  loading: { label: "Loading", color: "#fbbf24" },
  in_transit: { label: "In transit", color: "#60a5fa" },
  delivering: { label: "Delivering", color: "#60a5fa" },
  parked: { label: "Parked preloaded", color: "#93c5fd" },
  complete: { label: "Complete", color: "#4ade80" },
  cancelled: { label: "Cancelled", color: "rgba(255,255,255,0.35)" },
};

const card: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)", padding: 12, marginBottom: 10, color: "#fff", cursor: "pointer",
};

export default function TripsPage() {
  const router = useRouter();
  const nav = usePending();
  const shell = useCalculatorShell();
  const userId = shell.effectiveUserId || null;
  const { state, store, syncNow } = useTripStore(userId);
  const [showHidden, setShowHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await supabase.from("trips").select("*").eq("driver_id", userId).order("created_at", { ascending: false }).limit(50);
        if (cancelled || t.error) return;
        const trips = (t.data ?? []) as TripRow[];
        store.hydrate("trips", trips);
        // Trips deleted on the server leave the phone's list too.
        pruneMissingTrips(store, userId, trips, 50);
        const ids = trips.map((x) => x.trip_id);
        for (let i = 0; i < ids.length; i += 200) {
          const o = await supabase.from("trip_orders").select("*").in("trip_id", ids.slice(i, i + 200));
          if (!cancelled) store.hydrate("trip_orders", (o.data ?? []) as TripOrderRow[]);
        }
      } catch (e) {
        console.warn("[trips] list failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, userId]);

  const rows = useMemo(() => {
    if (!store || !userId) return [];
    const trips = store.list("trips", (t) => t.driver_id === userId);
    const when = (t: TripRow) => t.completed_at ?? t.started_at ?? "";
    return trips
      .sort((a, b) => (when(b) || "9999").localeCompare(when(a) || "9999"))
      .map((t) => {
        const orders = store.list("trip_orders", (o) => o.trip_id === t.trip_id);
        const primary = orders.find((o) => o.is_primary);
        return { trip: t, order: primary?.order_number ?? orders.find((o) => o.order_number)?.order_number ?? null };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userId, state]);

  const hiddenCount = rows.filter((r) => r.trip.driver_hidden).length;
  const visible = showHidden ? rows : rows.filter((r) => !r.trip.driver_hidden);
  const setHidden = (tripId: string, hidden: boolean) => {
    if (!store) return;
    setTripHidden(store, tripId, hidden);
    void syncNow();
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>Trips & PTDs</div>
        <button type="button" onClick={() => nav.go("blank", "/planner/trips/blank")} aria-busy={nav.is("blank")}
          style={{ border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#fff", borderRadius: 2, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Blank PTD
        </button>
      </div>
      {visible.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 15, textAlign: "center", marginTop: 40 }}>
          {loading ? "Loading…" : rows.length ? "Nothing to show." : "No trips yet. Start one from the Driver Dashboard."}
        </div>
      )}
      {visible.map(({ trip, order }) => {
        const s = STATUS[trip.status];
        const cancelled = trip.status === "cancelled";
        const reasons = cancelled ? cancelReasonsText(trip.cancel_reasons) : "";
        return (
          <div key={trip.trip_id} role="button" tabIndex={0} aria-busy={nav.is(trip.trip_id)}
            onClick={() => nav.go(trip.trip_id, `/planner/trips/${trip.trip_id}`)}
            onKeyDown={(e) => { if (e.key === "Enter") nav.go(trip.trip_id, `/planner/trips/${trip.trip_id}`); }}
            style={{ ...card, opacity: trip.driver_hidden ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{order ? `Order ${order}` : ptdCode(trip.trip_id)}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.label}</div>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              {[trip.shipper, trip.customer].filter(Boolean).join(" → ") || "—"}
            </div>
            {reasons && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{reasons}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {fmtDateTime(trip.cancelled_at ?? trip.completed_at ?? trip.started_at) || "Not started"}
              </div>
              {cancelled && (
                <button type="button"
                  onClick={(e) => { e.stopPropagation(); setHidden(trip.trip_id, !trip.driver_hidden); }}
                  style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>
                  {trip.driver_hidden ? "Unhide" : "Hide"}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setShowHidden((v) => !v)}
          style={{ display: "block", margin: "10px auto 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {showHidden ? "Hide hidden trips" : `Show hidden (${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
