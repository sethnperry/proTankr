"use client";
// app/planner/dispatch/PlanTripSheet.tsx
//
// "Plan Trip" on a driver's card: the same Begin Trip card the driver uses
// (StartLoadSheet), minus the miles and start city the driver gives at Begin.
// The sheet stays open under the pickers (they stack above it): closing it would reset what was typed.
// Applying fills the board's plan (pickup, drop, shipper, customer, order, supplier); the timeline builds from it.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { StartLoadSheet, type StartLoadValues } from "../components/StartLoadSheet";
import { AccessStripsSheet, UncardedSheet, type CityStrip } from "./AccessStripsSheet";
import { driveMinutesByDistance } from "@/lib/dispatch/forecast";
import { ProductPlanSheet, type PlanComps } from "./ProductPlanSheet";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { repeatedRefs } from "@/lib/trips/refs";
import type { DeliveryLocation, LocationTank } from "@/lib/trips/deliveryLocations";
import type { SupplierRow } from "@/lib/trips/types";

type TermRow = { terminal_id: string | number; terminal_name: string | null; city: string | null; state: string | null; lat?: number | null; lon?: number | null };
export type PlanTripPick = { terminalId: string; locationId: string; shipper: string; customer: string; orderNumber: string; supplierId: string | null;
  /** Product plan per compartment, highest first. */
  comps?: PlanComps | null;
  /** The pickup is a terminal the driver is not carded at, and the dispatcher chose to meet another driver there. */
  meet?: boolean };
const BLANK: StartLoadValues = {
  orderNumber: "", extraOrderNumbers: [], shipper: "", customer: "",
  deliveries: [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
  beginMiles: "", startCity: "", startState: "", planSlot: null, supplier: null, savePlan: null,
};

export function PlanTripSheet({ driverName, equipmentLabel, onChangeEquipment, trailerId, strips, usable, locationFreq, rangeMin, initial, initialPickupId, terminals, locations, tanks, companyId, userId, onLocationAdded, onApply, onClose }: {
  driverName: string; equipmentLabel: string; onChangeEquipment?: () => void; trailerId: string | null;
  /** The driver's access strips (most urgent first), and whether a terminal is one he can load at now. */
  strips: CityStrip[]; usable: (terminalId: string) => boolean;
  /** Times each delivery location has been used, and how many drive minutes a one-way delivery may take. */
  locationFreq: Map<string, number>; rangeMin: number | null; initial?: StartLoadValues; initialPickupId?: string | null;
  terminals: TermRow[]; locations: DeliveryLocation[]; tanks: LocationTank[]; companyId: string | null; userId: string | null;
  onLocationAdded: () => void; onApply: (p: PlanTripPick) => void; onClose: () => void;
}) {
  const L = useDashLook();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [pickup, setPickup] = useState<{ terminalId: string; name: string; city: string | null; state: string | null } | null>(() => {
    const t = initialPickupId ? terminals.find((x) => String(x.terminal_id) === initialPickupId) : null;
    return t ? { terminalId: String(t.terminal_id), name: t.terminal_name ?? "Terminal", city: t.city, state: t.state } : null;
  });
  const [termOpen, setTermOpen] = useState(false);
  const [stripsOpen, setStripsOpen] = useState(false);
  const [uncarded, setUncarded] = useState<TermRow | null>(null);
  const [meet, setMeet] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [comps, setComps] = useState<PlanComps | null>(null);
  const catalog = useProductsCatalog().data;
  const planName = comps ? comps.map((id) => { const x = id ? catalog.find((y) => y.product_id === id) : null; return x ? String(x.button_code ?? x.display_name ?? "").toUpperCase() : "–"; }).join("/") : null;
  const [wide, setWide] = useState(false); // show every delivery location, not only those in range
  // Shipper and customer start as the last ones entered here.
  const memKey = `proTankr:dispatchLastShipCust:${userId || "anon"}`;
  const [last] = useState<{ shipper: string; customer: string }>(() => {
    try { const r = JSON.parse(localStorage.getItem(memKey) || "null"); return { shipper: String(r?.shipper ?? ""), customer: String(r?.customer ?? "") }; } catch { return { shipper: "", customer: "" }; }
  });
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let off = false;
    void supabase.from("suppliers").select("supplier_id,company_id,name,is_active,created_by,client_updated_at").eq("company_id", companyId)
      .then(({ data }) => { if (!off) setSuppliers((data ?? []) as SupplierRow[]); });
    return () => { off = true; };
  }, [companyId]);

  const addSupplier = (name: string): SupplierRow | null => {
    if (!companyId) return null;
    const row = { supplier_id: crypto.randomUUID(), company_id: companyId, name: name.trim(), is_active: true, created_by: userId, client_updated_at: new Date().toISOString() } as unknown as SupplierRow;
    void supabase.from("suppliers").insert(row);
    setSuppliers((s) => [...s, row]);
    return row;
  };

  const submit = (v: StartLoadValues) => {
    const numbers = [v.orderNumber, ...v.extraOrderNumbers].filter((x) => x.trim());
    const rep = repeatedRefs(numbers);
    if (rep.length) { setError(`Order ${rep[0]} is entered twice.`); return; }
    const first = v.deliveries.find((d) => d.locationId);
    if (!first?.locationId || !pickup) { setError("Pick a pickup terminal and a saved delivery location."); return; }
    try { localStorage.setItem(memKey, JSON.stringify({ shipper: v.shipper, customer: v.customer })); } catch { /* private mode: it just will not be remembered */ }
    onApply({ terminalId: pickup.terminalId, locationId: first.locationId, shipper: v.shipper, customer: v.customer, orderNumber: v.orderNumber, supplierId: v.supplier?.supplier_id ?? null, comps, meet });
    onClose();
  };

  const choose = (t: TermRow) => {
    if (!usable(String(t.terminal_id))) { setUncarded(t); return; }
    setPickup({ terminalId: String(t.terminal_id), name: t.terminal_name ?? "Terminal", city: t.city, state: t.state }); setMeet(false);
    setStripsOpen(false); setTermOpen(false);
  };
  const takeUncarded = (asMeet: boolean) => {
    if (!uncarded) return;
    setPickup({ terminalId: String(uncarded.terminal_id), name: uncarded.terminal_name ?? "Terminal", city: uncarded.city, state: uncarded.state });
    setMeet(asMeet); setUncarded(null); setStripsOpen(false); setTermOpen(false);
  };
  const byId = (tid: string) => terminals.find((t) => String(t.terminal_id) === tid) ?? null;

  // Delivery locations: only those the driver can reach within a shift of the pickup, the busiest first.
  const origin = pickup ? byId(pickup.terminalId) : null;
  const shownLocations = useMemo(() => {
    let base = locations;
    if (origin?.lat != null && origin.lon != null && rangeMin && !wide) {
      const o = { lat: Number(origin.lat), lon: Number(origin.lon) };
      base = locations.filter((l) => l.lat == null || l.lon == null || driveMinutesByDistance(o, { lat: Number(l.lat), lon: Number(l.lon) }) <= rangeMin);
    }
    const top = new Set(base.filter((l) => (locationFreq.get(l.location_id) ?? 0) > 0)
      .sort((a, b) => (locationFreq.get(b.location_id) ?? 0) - (locationFreq.get(a.location_id) ?? 0)).slice(0, 12).map((l) => l.location_id));
    return base.map((l) => ({ ...l, starred: top.size ? top.has(l.location_id) : l.starred }));
  }, [locations, origin, rangeMin, wide, locationFreq]);
  const linkBtn = { background: "none", border: "none", padding: 0, marginLeft: 8, color: "#93c5fd", fontSize: 12, fontWeight: 700, cursor: "pointer" } as const;
  const lineExtra = (
    <>
      {onChangeEquipment && <button type="button" onClick={onChangeEquipment} style={linkBtn}>Change ›</button>}
      {origin && rangeMin ? <button type="button" onClick={() => setWide((w) => !w)} style={linkBtn}>{wide ? "All locations · Limit to range" : "In range of driver · Expand range"}</button> : null}
    </>
  );

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return terminals.filter((t) => !s || `${t.terminal_name ?? ""} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [terminals, q]);

  return (
    <>
      <StartLoadSheet open editing={false} forDriver={driverName} planRequired={false} initial={initial ?? { ...BLANK, shipper: last.shipper, customer: last.customer, planSlot: 1 }}
        presets={comps ? [{ slot: 1, name: planName, comps }] : []} onPlanTap={() => setPlanOpen(true)}
        pickupLabel={pickup ? `${pickup.name}${pickup.city ? `, ${pickup.city}` : ""}` : null} pickupTerminalId={pickup?.terminalId ?? null}
        onChangePickup={() => { setQ(""); if (strips.length) setStripsOpen(true); else setTermOpen(true); }}
        suppliers={suppliers} onAddSupplier={addSupplier} productColor={() => "#fff"} equipmentLabel={equipmentLabel} lineExtra={lineExtra}
        locations={shownLocations} tanks={tanks} origin={null} companyId={companyId} userId={userId} onLocationAdded={onLocationAdded}
        error={error} onClose={onClose} onSubmit={submit} />
      <ProductPlanSheet open={planOpen} trailerId={trailerId} value={comps} onApply={setComps} onClose={() => setPlanOpen(false)} />
      <AccessStripsSheet open={stripsOpen} driverName={driverName} strips={strips}
        onPick={(id) => { const t = byId(id); if (t) choose(t); }} onUncarded={(id) => { const t = byId(id); if (t) setUncarded(t); }}
        onSearch={() => { setQ(""); setTermOpen(true); }} onClose={() => setStripsOpen(false)} />
      <FullscreenModal open={termOpen} title="Pickup terminal" onClose={() => setTermOpen(false)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminal or city" autoFocus
          style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 10 }} />
        {hits.map((t) => (
          <button key={String(t.terminal_id)} type="button" className="dash-press"
            onClick={() => choose(t)}
            style={{ ...L.secondary, display: "flex", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, justifyContent: "space-between", gap: 8 }}>
            <span>{t.terminal_name}</span><span style={{ color: L.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</span>
          </button>
        ))}
      </FullscreenModal>
      <UncardedSheet open={!!uncarded} driverName={driverName} terminal={uncarded?.terminal_name ?? "this terminal"}
        onMeet={() => takeUncarded(true)} onIgnore={() => takeUncarded(false)}
        onPickNew={() => { setUncarded(null); setTermOpen(false); setStripsOpen(true); }} onClose={() => setUncarded(null)} />
    </>
  );
}
