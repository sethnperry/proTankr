"use client";
// app/planner/dispatch/PlanTripSheet.tsx
//
// "Plan Trip" on a driver's card: the same Begin Trip card the driver uses
// (StartLoadSheet), minus the miles and start city the driver gives at Begin.
// Applying fills the board's plan (pickup, drop, shipper, customer, order, supplier); the timeline builds from it.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { StartLoadSheet, type StartLoadValues } from "../components/StartLoadSheet";
import { repeatedRefs } from "@/lib/trips/refs";
import type { DeliveryLocation, LocationTank } from "@/lib/trips/deliveryLocations";
import type { SupplierRow } from "@/lib/trips/types";

type TermRow = { terminal_id: string | number; terminal_name: string | null; city: string | null; state: string | null };
export type PlanTripPick = { terminalId: string; locationId: string; shipper: string; customer: string; orderNumber: string; supplierId: string | null };
const BLANK: StartLoadValues = {
  orderNumber: "", extraOrderNumbers: [], shipper: "", customer: "",
  deliveries: [{ locationId: null, oneOffName: "", deliveryType: "drop" }],
  beginMiles: "", startCity: "", startState: "", planSlot: null, supplier: null, savePlan: null,
};

export function PlanTripSheet({ driverName, equipmentLabel, initial, initialPickupId, terminals, locations, tanks, companyId, userId, onLocationAdded, onApply, onClose }: {
  driverName: string; equipmentLabel: string; initial?: StartLoadValues; initialPickupId?: string | null;
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
    onApply({ terminalId: pickup.terminalId, locationId: first.locationId, shipper: v.shipper, customer: v.customer, orderNumber: v.orderNumber, supplierId: v.supplier?.supplier_id ?? null });
    onClose();
  };

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return terminals.filter((t) => !s || `${t.terminal_name ?? ""} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [terminals, q]);

  return (
    <>
      <StartLoadSheet open={!termOpen} editing={false} forDriver={driverName} planRequired={false} initial={initial ?? BLANK}
        pickupLabel={pickup ? `${pickup.name}${pickup.city ? `, ${pickup.city}` : ""}` : null} pickupTerminalId={pickup?.terminalId ?? null}
        onChangePickup={() => { setQ(""); setTermOpen(true); }}
        suppliers={suppliers} onAddSupplier={addSupplier} presets={[]} productColor={() => "#fff"} equipmentLabel={equipmentLabel}
        locations={locations} tanks={tanks} origin={null} companyId={companyId} userId={userId} onLocationAdded={onLocationAdded}
        error={error} onClose={onClose} onSubmit={submit} />
      <FullscreenModal open={termOpen} title="Pickup terminal" onClose={() => setTermOpen(false)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminal or city" autoFocus
          style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 10 }} />
        {hits.map((t) => (
          <button key={String(t.terminal_id)} type="button" className="dash-press"
            onClick={() => { setPickup({ terminalId: String(t.terminal_id), name: t.terminal_name ?? "Terminal", city: t.city, state: t.state }); setTermOpen(false); }}
            style={{ ...L.secondary, display: "flex", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, justifyContent: "space-between", gap: 8 }}>
            <span>{t.terminal_name}</span><span style={{ color: L.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</span>
          </button>
        ))}
      </FullscreenModal>
    </>
  );
}
