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
import { dispatchedForDriver } from "@/lib/trips/tripLogic";
import { swapRunOrder } from "@/lib/dispatch/dispatchTrip";
import { cancelReasonsText } from "@/lib/trips/cancelReasons";
import { ptdCode } from "@/lib/trips/code39";
import type { TripDeliveryRow, TripOrderRow, TripPickupRow, TripRow } from "@/lib/trips/types";
import { fmtDateTime } from "./PtdDocument";

import { usePending } from "@/lib/ui/pending";
const STATUS: Record<TripRow["status"], { label: string; color: string }> = {
  dispatched: { label: "Dispatched", color: "#93c5fd" },
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
  const [locs, setLocs] = useState<Record<string, string>>({});

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
          // Where each trip started and ended, for the subtitle.
          const [pk, dl] = await Promise.all([
            supabase.from("trip_pickups").select("*").in("trip_id", ids.slice(i, i + 200)),
            supabase.from("trip_deliveries").select("*").in("trip_id", ids.slice(i, i + 200)),
          ]);
          if (cancelled) return;
          store.hydrate("trip_pickups", (pk.data ?? []) as TripPickupRow[]);
          const dels = (dl.data ?? []) as TripDeliveryRow[];
          store.hydrate("trip_deliveries", dels);
          const locIds = [...new Set(dels.map((d) => d.location_id).filter(Boolean))] as string[];
          if (locIds.length) {
            const lr = await supabase.from("delivery_locations").select("location_id, name, location_number").in("location_id", locIds);
            if (!cancelled) setLocs((m) => ({ ...m, ...Object.fromEntries(((lr.data ?? []) as { location_id: string; name: string; location_number: string | null }[]).map((l) => [l.location_id, [l.name, l.location_number].filter(Boolean).join(" ")])) }));
          }
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
    // Loads dispatch planned come first, in the order they will run.
    const queued = dispatchedForDriver(trips, userId);
    const rest = trips.filter((t) => t.status !== "dispatched").sort((a, b) => (when(b) || "9999").localeCompare(when(a) || "9999"));
    return [...queued, ...rest]
      .map((t) => {
        const orders = store.list("trip_orders", (o) => o.trip_id === t.trip_id);
        const primary = orders.find((o) => o.is_primary);
        const numbered = orders.filter((o) => o.order_number);
        // Origin to destination: where it loaded and where it went. Racks it couldn't load at and
        // cancelled stops are left out.
        const picks = store.list("trip_pickups", (k) => k.trip_id === t.trip_id).filter((k) => k.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
        const drops = store.list("trip_deliveries", (d) => d.trip_id === t.trip_id).filter((d) => d.status !== "cancelled").sort((a, b) => a.seq - b.seq);
        const from = picks.map((k) => [k.name, [k.city, k.state].filter(Boolean).join(", ")].filter(Boolean).join(" ")).filter(Boolean).join(" + ");
        const to = drops.map((d) => (d.location_id && locs[d.location_id]) || d.one_off_name || "").filter(Boolean).join(" + ");
        const route = [from, to].filter(Boolean).join(" to ");
        return { trip: t, order: primary?.order_number ?? numbered[0]?.order_number ?? null, more: Math.max(0, numbered.length - 1), route };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, userId, state, locs]);

  const hiddenCount = rows.filter((r) => r.trip.driver_hidden).length;
  const visible = showHidden ? rows : rows.filter((r) => !r.trip.driver_hidden);
  const setHidden = (tripId: string, hidden: boolean) => {
    if (!store) return;
    setTripHidden(store, tripId, hidden);
    void syncNow();
  };

  // Moving a not-begun load swaps run order with its neighbour. Once begun it can't move.
  const queue = visible.filter((r) => r.trip.status === "dispatched").map((r) => r.trip);
  const moveQueued = (tripId: string, dir: -1 | 1) => {
    if (!store) return;
    const i = queue.findIndex((t) => t.trip_id === tripId);
    const other = queue[i + dir];
    if (i < 0 || !other) return;
    for (const pt of swapRunOrder(queue[i], other)) store.put("trips", pt);
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
      {visible.map(({ trip, order, more, route }) => {
        const s = STATUS[trip.status];
        const cancelled = trip.status === "cancelled";
        const reasons = cancelled ? cancelReasonsText(trip.cancel_reasons) : "";
        return (
          <div key={trip.trip_id} role="button" tabIndex={0} aria-busy={nav.is(trip.trip_id)}
            onClick={() => nav.go(trip.trip_id, `/planner/trips/${trip.trip_id}`)}
            onKeyDown={(e) => { if (e.key === "Enter") nav.go(trip.trip_id, `/planner/trips/${trip.trip_id}`); }}
            style={{ ...card, opacity: trip.driver_hidden ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", gap: 6, minWidth: 0, fontSize: 16, fontWeight: 800 }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {order ? `Order ${order}` : ptdCode(trip.trip_id)}
                </span>
                {more > 0 && <span style={{ flexShrink: 0, color: "rgba(255,255,255,0.55)" }}>+{more}</span>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color, flexShrink: 0 }}>{s.label}</div>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              {route || [trip.shipper, trip.customer].filter(Boolean).join(" → ") || "—"}
            </div>
            {reasons && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{reasons}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {fmtDateTime(trip.cancelled_at ?? trip.completed_at ?? trip.started_at) || "Not started"}
              </div>
              {trip.status === "dispatched" && queue.length > 1 && (
                <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginRight: 4 }}>Run order</span>
                  {([-1, 1] as const).map((dir) => {
                    const ok = !!queue[queue.findIndex((t) => t.trip_id === trip.trip_id) + dir];
                    return (
                      <button key={dir} type="button" aria-label={dir === -1 ? "Run earlier" : "Run later"} disabled={!ok}
                        onClick={() => moveQueued(trip.trip_id, dir)}
                        style={{ border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: ok ? "#fff" : "rgba(255,255,255,0.2)", borderRadius: 2, padding: "4px 10px", fontSize: 13, cursor: ok ? "pointer" : "default" }}>
                        {dir === -1 ? "▲" : "▼"}
                      </button>
                    );
                  })}
                </span>
              )}
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
