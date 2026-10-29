"use client";
// app/planner/dispatch/DispatchEditSheet.tsx
//
// Dispatch editing a load in progress with the same Begin Trip card the driver fills in. Every field
// can be changed; a stop the truck has already used keeps its own record (buildStartLoad's rule).
// When product is already aboard, a caution comes first: the change corrects the record.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { supabase } from "@/lib/supabase/client";
import { StartLoadSheet, type StartLoadValues } from "../components/StartLoadSheet";
import { buildStartLoad } from "@/lib/trips/tripLogic";
import { saveTripEdit } from "@/lib/dispatch/tripEdits";
import { repeatedRefs } from "@/lib/trips/refs";
import { serverOrderConflicts } from "@/lib/trips/refCheck";
import { plannedDeliveries } from "@/lib/trips/tripFlow";
import type { DeliveryLocation, LocationTank } from "@/lib/trips/deliveryLocations";
import type { FleetTrip } from "@/lib/trips/useFleetTrips";
import type { SupplierRow, TripOrderRow } from "@/lib/trips/types";

type TermRow = { terminal_id: string | number; terminal_name: string; city: string | null; state: string | null };

export function DispatchEditSheet({ ft, terminals, locations, tanks, companyId, userId, onLocationAdded, onDone, onClose }: {
  ft: FleetTrip; terminals: TermRow[]; locations: DeliveryLocation[]; tanks: LocationTank[]; companyId: string | null; userId: string | null;
  onLocationAdded: () => void; onDone: () => void; onClose: () => void;
}) {
  const L = useDashLook();
  const loaded = ft.compLoads.some((c) => c.disposition === "loaded" || c.disposition === "delivered");
  const [ack, setAck] = useState(!loaded);
  const [orders, setOrders] = useState<TripOrderRow[] | null>(null);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [termOpen, setTermOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pickupSel, setPickupSel] = useState<{ terminalId: string; name: string; city: string | null; state: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pk = useMemo(() => [...ft.pickups].filter((p) => p.outcome !== "no_load").sort((a, b) => a.seq - b.seq)[0] ?? null, [ft.pickups]);

  useEffect(() => {
    let off = false;
    void supabase.from("trip_orders").select("*").eq("trip_id", ft.trip.trip_id).then(({ data }) => { if (!off) setOrders((data ?? []) as TripOrderRow[]); });
    if (companyId) void supabase.from("suppliers").select("supplier_id,company_id,name,is_active,created_by,client_updated_at").eq("company_id", companyId).then(({ data }) => { if (!off) setSuppliers((data ?? []) as SupplierRow[]); });
    return () => { off = true; };
  }, [ft.trip.trip_id, companyId]);

  const initial = useMemo<StartLoadValues>(() => {
    const prim = orders?.find((o) => o.is_primary) ?? null;
    const sup = pk?.supplier_id ? suppliers.find((s) => s.supplier_id === pk.supplier_id) : null;
    const planned = plannedDeliveries(ft.deliveries);
    return {
      orderNumber: prim?.order_number ?? ft.orderNumbers[0] ?? "",
      extraOrderNumbers: (orders ?? []).filter((o) => !o.is_primary && !!o.order_number).map((o) => o.order_number ?? ""),
      shipper: ft.trip.shipper ?? "", customer: ft.trip.customer ?? "",
      deliveries: planned.length ? planned.map((d) => ({ locationId: d.location_id, oneOffName: d.one_off_name, deliveryType: d.delivery_type })) : [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
      beginMiles: ft.trip.begin_miles == null ? "" : String(ft.trip.begin_miles),
      startCity: ft.trip.start_city ?? "", startState: ft.trip.start_state ?? "",
      planSlot: null, supplier: sup ? { supplier_id: sup.supplier_id, name: sup.name } : null, savePlan: null,
    };
  }, [orders, suppliers, ft, pk]);

  const submit = async (v: StartLoadValues) => {
    if (!companyId || !userId || !orders) return;
    const numbers = [v.orderNumber, ...v.extraOrderNumbers].filter((x) => x.trim());
    const rep = repeatedRefs(numbers);
    if (rep.length) { setError(`Order ${rep[0]} is entered twice.`); return; }
    setBusy(true); setError(null);
    try {
      const taken = numbers.length ? await serverOrderConflicts(companyId, numbers, ft.trip.trip_id) : [];
      if (taken.length) { setError(`Order ${taken[0]} is already on another trip.`); return; }
      const miles = v.beginMiles.trim() === "" ? null : Number(v.beginMiles);
      const rows = buildStartLoad({
        companyId, userId: ft.trip.driver_id, truckId: ft.trip.truck_id ?? null, trailerId: ft.trip.trailer_id ?? null,
        orderNumber: v.orderNumber, extraOrderNumbers: v.extraOrderNumbers, shipper: v.shipper, customer: v.customer,
        pickup: pickupSel
          ? { terminalId: pickupSel.terminalId, rackId: null, name: pickupSel.name, city: pickupSel.city, state: pickupSel.state }
          : { terminalId: pk?.terminal_id ? String(pk.terminal_id) : null, rackId: pk?.rack_id ?? null, name: pk?.name ?? null, city: pk?.city ?? null, state: pk?.state ?? null },
        deliveries: v.deliveries, beginMiles: miles != null && Number.isFinite(miles) ? miles : null, startCity: v.startCity, startState: v.startState,
      }, { now: new Date(), newId: () => crypto.randomUUID(), existing: { trip: ft.trip, orders, pickups: ft.pickups, deliveries: ft.deliveries } });
      const sameSupplier = (v.supplier?.supplier_id ?? null) === (pk?.supplier_id ?? null);
      const err = await saveTripEdit(ft, orders.map((o) => o.order_id), rows as any, sameSupplier ? undefined : v.supplier?.supplier_id ?? null, userId);
      if (err) { setError(err); return; }
      onDone(); onClose();
    } finally { setBusy(false); }
  };

  const addSupplier = (name: string): SupplierRow | null => {
    if (!companyId) return null;
    const row = { supplier_id: crypto.randomUUID(), company_id: companyId, name: name.trim(), is_active: true, created_by: userId, client_updated_at: new Date().toISOString() } as unknown as SupplierRow;
    void supabase.from("suppliers").insert(row);
    setSuppliers((s) => [...s, row]);
    return row;
  };

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return terminals.filter((t) => !s || `${t.terminal_name} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [terminals, q]);

  if (!ack) {
    return (
      <FullscreenModal open title="Correct a loaded trip?" onClose={onClose}>
        <div style={{ fontSize: 14, lineHeight: 1.45, color: "rgba(255,255,255,0.85)" }}>
          Product is already on this trailer. Changes here correct the trip record and are sent to the driver. Use them to fix a mistake, not to reroute a load that is already moving.
        </div>
        <button type="button" onClick={() => setAck(true)} style={{ marginTop: 16, border: "none", background: "#fff", color: "#000", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 16px", cursor: "pointer" }}>Continue</button>
      </FullscreenModal>
    );
  }
  const pickupUsed = !!pk && (!!pk.arrived_at || !!pk.left_at || !!pk.load_id);
  return (
    <>
      <StartLoadSheet open={!termOpen && !!orders} editing initial={initial} planRequired={false}
        pickupLabel={pickupSel ? `${pickupSel.name}${pickupSel.city ? `, ${pickupSel.city}` : ""}` : [pk?.name, pk?.city].filter(Boolean).join(", ") || null}
        pickupTerminalId={pickupSel?.terminalId ?? (pk?.terminal_id ? String(pk.terminal_id) : null)}
        onChangePickup={() => { if (pickupUsed) { setError("The truck has already used this rack, so it stays on the record."); return; } setQ(""); setTermOpen(true); }}
        suppliers={suppliers} onAddSupplier={addSupplier} presets={[]} productColor={() => "#fff"}
        equipmentLabel={[ft.truckName ? `Truck ${ft.truckName}` : null, ft.trailerName ? `Trailer ${ft.trailerName}` : null].filter(Boolean).join(" · ")}
        locations={locations} tanks={tanks} origin={null} companyId={companyId} userId={userId} onLocationAdded={onLocationAdded}
        busy={busy} error={error} onClose={onClose} onSubmit={(v) => void submit(v)} />
      <FullscreenModal open={termOpen} title="Pickup terminal" onClose={() => setTermOpen(false)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminal or city" autoFocus
          style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 10 }} />
        {hits.map((t) => (
          <button key={String(t.terminal_id)} type="button" className="dash-press"
            onClick={() => { setPickupSel({ terminalId: String(t.terminal_id), name: t.terminal_name, city: t.city, state: t.state }); setTermOpen(false); }}
            style={{ ...L.secondary, display: "flex", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, justifyContent: "space-between", gap: 8 }}>
            <span>{t.terminal_name}</span><span style={{ color: L.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</span>
          </button>
        ))}
      </FullscreenModal>
    </>
  );
}
