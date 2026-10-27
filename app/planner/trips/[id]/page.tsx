"use client";
// app/planner/trips/[id]/page.tsx
//
// One trip's Product Transfer Document (docs/trip-workflow-design.md §13).
// Reads from the offline trip store, so a PTD for a trip just finished with no
// signal still opens; pulls the trip from the server into the store first so
// another driver's or an older trip shows too. Print uses the browser's own
// print dialog (Save as PDF on every phone).

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { useTripStore } from "@/lib/trips/useTripStore";
import { useDriverSignature, useTripSettings } from "@/lib/trips/useTripData";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { locationTitle } from "@/lib/trips/deliveryLocations";
import { buildPtd } from "@/lib/trips/ptd";
import type {
  TripCompartmentLoadRow,
  TripDeliveryRow,
  TripDeliveryTankRow,
  TripEventRow,
  TripOrderRow,
  TripPickupRow,
  TripRow,
} from "@/lib/trips/types";
import { PrintPortal, PtdDocument } from "../PtdDocument";
import { DispatchedPreview } from "./DispatchedPreview";

const btn: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer",
};
const back: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 };

export default function TripPtdPage() {
  const params = useParams<{ id: string }>();
  const tripId = String(params?.id ?? "");
  const router = useRouter();
  const shell = useCalculatorShell();
  const userId = shell.effectiveUserId || null;
  const { state, store } = useTripStore(userId);
  const { reasons } = useTripSettings(shell.companyId || null);
  const signature = useDriverSignature(userId);
  const { data: products } = useProductsCatalog();

  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [locNames, setLocNames] = useState<Record<string, string>>({});
  const [equip, setEquip] = useState<{ truck: string | null; trailer: string | null }>({ truck: null, trailer: null });

  // Pull the trip and everything under it into the store.
  useEffect(() => {
    if (!store || !tripId) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, o, p, d, c, e] = await Promise.all([
          supabase.from("trips").select("*").eq("trip_id", tripId),
          supabase.from("trip_orders").select("*").eq("trip_id", tripId),
          supabase.from("trip_pickups").select("*").eq("trip_id", tripId),
          supabase.from("trip_deliveries").select("*").eq("trip_id", tripId),
          supabase.from("trip_compartment_loads").select("*").eq("trip_id", tripId),
          supabase.from("trip_events").select("*").eq("trip_id", tripId),
        ]);
        if (cancelled) return;
        store.hydrate("trips", (t.data ?? []) as TripRow[]);
        store.hydrate("trip_orders", (o.data ?? []) as TripOrderRow[]);
        store.hydrate("trip_pickups", (p.data ?? []) as TripPickupRow[]);
        const deliveries = (d.data ?? []) as TripDeliveryRow[];
        store.hydrate("trip_deliveries", deliveries);
        store.hydrate("trip_compartment_loads", (c.data ?? []) as TripCompartmentLoadRow[]);
        store.hydrate("trip_events", (e.data ?? []) as TripEventRow[]);
        const ids = deliveries.map((x) => x.delivery_id);
        if (ids.length) {
          const tk = await supabase.from("trip_delivery_tanks").select("*").in("delivery_id", ids);
          if (!cancelled) store.hydrate("trip_delivery_tanks", (tk.data ?? []) as TripDeliveryTankRow[]);
        }
      } catch (err) {
        console.warn("[trips] PTD load failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, tripId]);

  const data = useMemo(() => {
    if (!store) return null;
    const trip = store.list("trips", (t) => t.trip_id === tripId)[0];
    if (!trip) return null;
    const deliveries = store.list("trip_deliveries", (d) => d.trip_id === tripId);
    const deliveryIds = new Set(deliveries.map((d) => d.delivery_id));
    return {
      trip,
      orders: store.list("trip_orders", (o) => o.trip_id === tripId),
      pickups: store.list("trip_pickups", (p) => p.trip_id === tripId),
      deliveries,
      compLoads: store.list("trip_compartment_loads", (c) => c.trip_id === tripId),
      tanks: store.list("trip_delivery_tanks", (t) => deliveryIds.has(t.delivery_id)),
      events: store.list("trip_events", (e) => e.trip_id === tripId),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, tripId, state]);

  // Driver names, delivery location names, truck/trailer.
  const driverIds = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>([data.trip.driver_id]);
    data.deliveries.forEach((d) => d.delivering_driver_id && s.add(d.delivering_driver_id));
    data.events.forEach((e) => e.actor_id && s.add(e.actor_id));
    return [...s].sort();
  }, [data]);
  const driverKey = driverIds.join(",");
  useEffect(() => {
    if (!driverIds.length) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.rpc("get_display_names_full", { p_user_ids: driverIds });
      if (cancelled || !Array.isArray(rows)) return;
      setNames(Object.fromEntries((rows as { user_id: string; display_name: string | null }[]).map((r) => [r.user_id, r.display_name ?? ""])));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverKey]);

  const locIds = useMemo(() => [...new Set((data?.deliveries ?? []).map((d) => d.location_id).filter(Boolean) as string[])].sort(), [data]);
  const locKey = locIds.join(",");
  useEffect(() => {
    if (!locIds.length) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.from("delivery_locations").select("location_id,name,location_number").in("location_id", locIds);
      if (cancelled) return;
      setLocNames(Object.fromEntries(((rows ?? []) as { location_id: string; name: string; location_number: string | null }[])
        .map((r) => [r.location_id, locationTitle(r)])));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey]);

  const truckId = data?.trip.truck_id ?? null;
  const trailerId = data?.trip.trailer_id ?? null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, r] = await Promise.all([
        truckId ? supabase.from("trucks").select("truck_name").eq("truck_id", truckId).maybeSingle() : Promise.resolve({ data: null }),
        trailerId ? supabase.from("trailers").select("trailer_name").eq("trailer_id", trailerId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setEquip({
        truck: (t.data as { truck_name?: string } | null)?.truck_name ?? null,
        trailer: (r.data as { trailer_name?: string } | null)?.trailer_name ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [truckId, trailerId]);

  const ptd = useMemo(() => {
    if (!data) return null;
    const productName = (id: string | null) => {
      if (!id) return "Product";
      const p = products.find((x) => x.product_id === id);
      return p ? String(p.display_name || p.product_name || "Product") : "Product";
    };
    return buildPtd(data, {
      product: productName,
      delivery: (d) => (d.location_id && locNames[d.location_id]) || d.one_off_name || "Delivery",
      driver: (id) => (id && names[id]) || "Driver",
      delayReason: (id) => (id ? reasons.find((r) => r.reason_id === id)?.label ?? null : null),
    });
  }, [data, products, locNames, names, reasons]);

  if (data && data.trip.status === "dispatched") {
    return (
      <DispatchedPreview trip={data.trip} pickups={data.pickups} deliveries={data.deliveries} locNames={locNames} products={products}
        onBack={() => (window.history.length > 1 ? router.back() : router.push("/planner/trips"))} />
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push("/planner/trips"))} style={back}>‹ Back</button>
        {ptd && <button type="button" onClick={() => window.print()} style={btn}>Print / Save PDF</button>}
      </div>
      {!ptd && (
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, textAlign: "center", marginTop: 40 }}>
          {loading ? "Loading…" : "Trip not found."}
        </div>
      )}
      {ptd && (
        <>
          <div style={{ overflowX: "auto" }}>
            <PtdDocument ptd={ptd} truckName={equip.truck} trailerName={equip.trailer} viewerId={userId} viewerSignature={signature.svg} />
          </div>
          <PrintPortal>
            <PtdDocument print ptd={ptd} truckName={equip.truck} trailerName={equip.trailer} viewerId={userId} viewerSignature={signature.svg} />
          </PrintPortal>
        </>
      )}
    </div>
  );
}
