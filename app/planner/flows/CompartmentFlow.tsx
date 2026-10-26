"use client";
// app/planner/flows/CompartmentFlow.tsx
//
// Choose the product for one compartment. A container: reads the planner model with usePlanner() and hands the
// windows what they show. Mount it anywhere under PlannerProvider.

import CompartmentModal from "../modals/CompartmentModal";
import { styles } from "../ui/styles";
import { usePlanner } from "../PlannerContext";

export default function CompartmentFlow() {
  const {
    shell,
    active,
    compModalOpen,
    compModalComp,
    compartments,
    compPlan,
    terminalProducts,
    setCompPlan,
    closeCompModal,
    selectedRackName,
    terminalLabel,
    fetchTerminalProducts,
  } = usePlanner();

  return (
    <>
      <CompartmentModal
        open={compModalOpen}
        compNumber={compModalComp}
        compartments={compartments}
        compPlan={compPlan}
        terminalProducts={terminalProducts}
        styles={styles}
        setCompPlan={setCompPlan}
        onClose={closeCompModal}
        selectedRackId={active ? "" : (shell.location.selectedRackId ?? "")}
        rackName={selectedRackName}
        terminalName={terminalLabel}
        onTerminalProductsChanged={fetchTerminalProducts}
        myRole={shell.role}
        searchable
      />
    </>
  );
}
