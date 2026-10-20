"use client";
// app/planner/trips/[id]/DispatchedPreview.tsx
//
// What a dispatched (not yet begun) load looks like: the trip recap from the
// Driver Dashboard without order numbers or suppliers (those are confirmed or
// corrected after the driver begins). Read-only; there is no way to begin it
// from here.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { CompartmentStrip } from "@/app/planner/components/trip/CompartmentStrip";
import { productColorFor } from "@/app/planner/utils/productColor";
import { readPlannedComps } from "@/lib/trips/addPickupCheck";
import type { CatalogProduct } from "@/lib/queries/useProductsCatalog";
import type { TripDeliveryRow, TripPickupRow, TripRow } from "@/lib/trips/types";

const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.14)", background: "#121213", borderRadius: 2, padding: "14px 14px 16px", marginBottom: 12 };
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" };
const muted = "rgba(255,255,255,0.55)";

const when = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
};

export function DispatchedPreview({
  trip, pickups, deliveries, locNames, products, onBack,
}: {
  trip: TripRow;
  pickups: TripPickupRow[];
  deliveries: TripDeliveryRow[];
  locNames: Record<string, string>;
  products: CatalogProduct[];
  onBack: () => void;
}) {
  const [equip, setEquip] = useState<{ truck: string | null; trailer: string | null }>({ truck: null, trailer: null });
  const [comps, setComps] = useState<{ n: number; size: number }[]>([]);
  const [places, setPlaces] = useState<Record<string, string>>({});
  const truckId = trip.planned_truck_id ?? null;
  const trailerId = trip.planned_trailer_id ?? null;
  const locIds = deliveries.map((d) => d.location_id).filter(Boolean).join(",");

  useEffect(() => {
    let off = false;
    (async () => {
      const [t, r, c] = await Promise.all([
        truckId ? supabase.from("trucks").select("truck_name").eq("truck_id", truckId).maybeSingle() : Promise.resolve({ data: null }),
        trailerId ? supabase.from("trailers").select("trailer_name").eq("trailer_id", trailerId).maybeSingle() : Promise.resolve({ data: null }),
        trailerId ? supabase.from("trailer_compartments").select("comp_number, max_gallons").eq("trailer_id", trailerId).order("comp_number") : Promise.resolve({ data: [] }),
      ]);
      if (off) return;
      setEquip({ truck: (t.data as any)?.truck_name ?? null, trailer: (r.data as any)?.trailer_name ?? null });
      setComps(((c.data ?? []) as any[]).map((x) => ({ n: Number(x.comp_number), size: Number(x.max_gallons) || 0 })));
    })();
    return () => { off = true; };
  }, [truckId, trailerId]);

  useEffect(() => {
    if (!locIds) return;
    let off = false;
    void supabase.from("delivery_locations").select("location_id, city, state").in("location_id", locIds.split(",")).then(({ data }) => {
      if (off) return;
      setPlaces(Object.fromEntries(((data ?? []) as any[]).map((r) => [r.location_id, [r.city, r.state].filter(Boolean).join(", ")])));
    });
    return () => { off = true; };
  }, [locIds]);

  const byId = new Map(products.map((p) => [p.product_id, p]));
  const colorOf = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : null;
    return p ? p.hex_code ?? productColorFor(p.display_name || p.product_name) : null;
  };
  const codeOf = (id: string) => { const p = byId.get(id); return p?.button_code || (p ? (p.display_name || p.product_name).split(" ")[0] : "?"); };

  const sortedPickups = [...pickups].sort((a, b) => a.seq - b.seq);
  const planned = new Map<number, string>();
  for (const pk of sortedPickups) for (const c of readPlannedComps(pk.planned_comps) ?? []) planned.set(c.comp_number, c.product_id);
  const slots = comps.map((c) => ({
    comp: c.n, size: c.size, color: colorOf(planned.get(c.n)),
    title: `C${c.n}${planned.get(c.n) ? ` · ${byId.get(planned.get(c.n)!)?.product_name ?? ""}` : " · not planned"}`,
  }));
  const equipLine = [equip.truck && `Truck ${equip.truck}`, equip.trailer && `Trailer ${equip.trailer}`].filter(Boolean).join(" · ");
  const productsAboard = [...new Set(planned.values())];

  return (
    <div style={{ padding: 16, paddingBottom: 40, maxWidth: 640, margin: "0 auto" }}>
      <button type="button" onClick={onBack}
        style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 12 }}>‹ Back</button>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...label, color: "#93c5fd" }}>Dispatched · preview</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: muted }}>{when(trip.planned_start_at)}</span>
        </div>
        <div style={{ fontSize: 13, color: muted, marginTop: 6 }}>{equipLine || "Equipment not planned"}</div>

        {sortedPickups.map((pk, i) => (
          <div key={pk.pickup_id} style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
            <span style={{ ...label, width: 66 }}>Pickup{sortedPickups.length > 1 ? ` ${i + 1}` : ""}</span>
            <span style={{ fontSize: 14, color: muted }}>{[pk.city, pk.state].filter(Boolean).join(", ")}</span>
            <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, textAlign: "right" }}>{pk.name ?? "Terminal"}</span>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          {slots.length > 0 ? <CompartmentStrip slots={slots} height={16} gap={5} /> : <div style={{ fontSize: 12, color: muted }}>No compartment plan from dispatch.</div>}
          {productsAboard.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 8, fontSize: 13 }}>
              {[...planned.entries()].sort((a, b) => a[0] - b[0]).map(([n, pid]) => (
                <span key={n} style={{ color: "rgba(255,255,255,0.8)" }}>C{n} {codeOf(pid)}</span>
              ))}
            </div>
          )}
        </div>

        {[...deliveries].sort((a, b) => a.seq - b.seq).map((d, i) => (
          <div key={d.delivery_id} style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
            <span style={{ ...label, width: 66 }}>{d.delivery_type === "pump_off" ? "Pump off" : "Delivery"}{deliveries.length > 1 ? ` ${i + 1}` : ""}</span>
            <span style={{ fontSize: 14, color: muted }}>{(d.location_id && places[d.location_id]) || ""}</span>
            <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, textAlign: "right" }}>{(d.location_id && locNames[d.location_id]) || d.one_off_name || "Delivery"}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 13, color: muted, lineHeight: 1.4 }}>
        Order number and supplier are confirmed or corrected after you begin this trip.
      </div>
    </div>
  );
}
