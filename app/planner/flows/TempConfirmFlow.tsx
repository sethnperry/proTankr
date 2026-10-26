"use client";
// app/planner/flows/TempConfirmFlow.tsx
//
// Confirm the product temperature, at the start of a load and again after a terminal change in another city. A container: reads the planner model with usePlanner() and hands the
// window what it shows. Mount it anywhere under PlannerProvider.

import ProductTempModal from "../modals/ProductTempModal";
import TempDial from "../components/TempDial";
import { styles } from "../ui/styles";
import { usePlanner } from "../PlannerContext";

export default function TempConfirmFlow() {
  const { shell, tempDialOpen, setTempDialOpen, tempReconfirmProductIds, setTempReconfirmProductIds, handleConfirmTempReconfirm, handleConfirmTempAndBeginLoad, fuelTempLoading, fuelTempAmbientF, fuelTempConfidence, predictedFuelTempF, tempF, setTempF, setSingleProductTempF, tempModalProductGroups } = usePlanner();

  return (
        <ProductTempModal
          open={tempDialOpen}
          onClose={() => { setTempDialOpen(false); setTempReconfirmProductIds(null); }}
          // Two callers share this instance: the LOAD flow's pre-load temp
          // confirm (tempReconfirmProductIds null -> confirm temp, then
          // stale-API check, then begin) and the mid-load terminal-switch
          // different-city reconfirm (tempReconfirmProductIds set -> propagate
          // the confirmed temp into the in-progress plan and return to Plan
          // Review).
          onConfirm={tempReconfirmProductIds != null ? handleConfirmTempReconfirm : handleConfirmTempAndBeginLoad}
          styles={styles}
          selectedCity={shell.location.selectedCity}
          selectedState={shell.location.selectedState}
          selectedTerminalId={shell.location.selectedTerminalId}
          ambientTempLoading={fuelTempLoading && fuelTempAmbientF == null}
          ambientTempF={fuelTempAmbientF}
          tempF={tempF}
          setTempF={setTempF}
          productGroups={tempModalProductGroups}
          onSetProductTemp={setSingleProductTempF}
          predictedFuelTempF={predictedFuelTempF}
          fuelTempConfidence={fuelTempConfidence}
          fuelTempLoading={fuelTempLoading}
          TempDial={TempDial}
        />
  );
}
