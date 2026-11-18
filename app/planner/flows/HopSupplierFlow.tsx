"use client";
// app/planner/flows/HopSupplierFlow.tsx
//
// The sourcing sheet. It opens (and can always be dismissed) in two places:
//  - on Arrive at a rack, when no supplier was picked for that terminal;
//  - when leaving a rack with "Couldn't load", when none was picked there: which supplier was tried.
// The next terminal gets its own question when the driver arrives there. After a hop the old "sourcing for the new
// terminal" stage just closes itself and returns to the dashboard.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SupplierPanel } from "../components/supplier/SupplierPanel";
import { usePlanner } from "../PlannerContext";
import { SURFACE } from "../theme";

export default function HopSupplierFlow() {
  const router = useRouter();
  const {
    couldntLoad, finishCouldntLoad, onLeaveSupplierDone, effectiveUserId, shell, location, terminalLabel, equipment, supplierPanelProducts,
    resolvedSupplierPicks, onSupplierPicks, tripSuppliers, addTripSupplier, supplierPicks, onSupplierSwitched,
    tripPickup, tripWaitingPickup,
  } = usePlanner() as any;
  const needsSupplier = !!supplierPicks.loaded && supplierPicks.picks.length === 0 && !supplierPicks.skipped;

  // After a hop the next terminal is asked about on arrival: this stage only finishes the hop (back to the dashboard).
  const hopFinish = couldntLoad?.stage === "supplier";
  useEffect(() => {
    if (!hopFinish) return;
    finishCouldntLoad();
    if (couldntLoad.hopped && window.location.pathname !== "/planner/home") router.push("/planner/home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hopFinish]);

  // Leaving a rack: nothing to ask when a supplier is already picked (or skipped), so just move on.
  const leaving = couldntLoad?.stage === "leave_supplier";
  const settled = !!supplierPicks.loaded && !needsSupplier;
  useEffect(() => { if (leaving && settled) onLeaveSupplierDone(); }, [leaving, settled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving at a rack with no supplier: ask once for that stop. Dismissing it is fine.
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const pk = (tripPickup ?? tripWaitingPickup ?? null) as { pickup_id: string; terminal_id: string | null; arrived_at: string | null; begin_at: string | null; left_at: string | null; outcome: string | null } | null;
  const pickupId = pk?.pickup_id ?? null;
  const atRack = !!pk && !!pk.arrived_at && !pk.begin_at && !pk.left_at && !pk.outcome && String(pk.terminal_id ?? "") === String(location.selectedTerminalId ?? "");
  useEffect(() => {
    if (!atRack || !pickupId || !needsSupplier) return;
    const key = `proTankr:supplierAsked:${pickupId}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch { /* storage blocked: ask once per mount */ }
    setArrivalOpen(true);
  }, [atRack, pickupId, needsSupplier]);

  const open = (leaving && needsSupplier) || arrivalOpen;
  if (!open) return null;
  const leavingName: string = leaving ? couldntLoad.prev.terminalName : (terminalLabel ?? "this terminal");
  const done = () => { if (leaving) onLeaveSupplierDone(); setArrivalOpen(false); };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: SURFACE, border: "1px solid rgba(255,255,255,0.1)", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>
          {leaving ? `Which supplier were you trying at ${leavingName}?` : `Sourcing at ${leavingName}`}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
          {leaving ? "It helps the next driver. You can skip this." : "Each terminal has its own sourcing. Pick the supplier for this one, or skip it."}
        </div>
        <SupplierPanel
          userId={effectiveUserId || null}
          companyId={shell.companyId || null}
          terminalId={location.selectedTerminalId ? String(location.selectedTerminalId) : null}
          terminalName={terminalLabel ?? null}
          rackId={location.selectedRackId ? String(location.selectedRackId) : null}
          truckLabel={equipment.truckNameById[equipment.selectedCombo?.truck_id ?? ""] ?? ""}
          products={supplierPanelProducts}
          picks={resolvedSupplierPicks}
          onPicks={onSupplierPicks}
          suppliers={tripSuppliers}
          onAddSupplier={addTripSupplier}
          promptToken={1}
          onSkip={supplierPicks.skip}
          onSwitched={onSupplierSwitched}
        />
        <button type="button" onClick={done}
          style={{ width: "100%", marginTop: 12, padding: "14px 16px", borderRadius: 2, border: "1px solid #fff", background: "#fff", color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          {leaving ? "Done · Pick the next terminal" : "Done"}
        </button>
      </div>
    </div>
  );
}
