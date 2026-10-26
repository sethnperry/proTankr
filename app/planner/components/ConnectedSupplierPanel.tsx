"use client";
// app/planner/components/ConnectedSupplierPanel.tsx
//
// The supplier picker shown inside Plan Review once loading begins. Reads the planner
// model with usePlanner(); SupplierPanel itself stays a presentational component.

import { SupplierPanel } from "./supplier/SupplierPanel";
import { usePlanner } from "../PlannerContext";

export default function ConnectedSupplierPanel() {
  const {
    effectiveUserId, shell, location, terminalLabel, equipment, supplierPanelProducts, resolvedSupplierPicks,
    onSupplierPicks, tripSuppliers, addTripSupplier, supplierPromptToken, supplierPicks, onSupplierSwitched,
  } = usePlanner();
  return (
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
      promptToken={supplierPromptToken}
      onSkip={supplierPicks.skip}
      onSwitched={onSupplierSwitched}
    />
  );
}
