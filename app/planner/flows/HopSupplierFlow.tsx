"use client";
// app/planner/flows/HopSupplierFlow.tsx
//
// After "Couldn't load" moves the driver to another rack: pick the new terminal's sourcing,
// then go back to the dashboard, where its status (out of product, long line) shows.

import { useRouter } from "next/navigation";
import { SupplierPanel } from "../components/supplier/SupplierPanel";
import { usePlanner } from "../PlannerContext";
import { SURFACE } from "../theme";

export default function HopSupplierFlow() {
  const router = useRouter();
  const {
    couldntLoad, finishCouldntLoad, effectiveUserId, shell, location, terminalLabel, equipment, supplierPanelProducts,
    resolvedSupplierPicks, onSupplierPicks, tripSuppliers, addTripSupplier, supplierPicks, onSupplierSwitched,
  } = usePlanner();
  if (couldntLoad?.stage !== "supplier") return null;
  const done = () => {
    finishCouldntLoad();
    if (couldntLoad.hopped && window.location.pathname !== "/planner/home") router.push("/planner/home");
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10400, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: SURFACE, border: "1px solid rgba(255,255,255,0.1)", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>
          Sourcing at {terminalLabel ?? "the new terminal"}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
          Each terminal has its own sourcing. Pick the supplier for this one.
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
          {couldntLoad.hopped ? "Done · Back to Dashboard" : "Done"}
        </button>
      </div>
    </div>
  );
}
