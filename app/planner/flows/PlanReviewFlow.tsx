"use client";
// app/planner/flows/PlanReviewFlow.tsx
//
// Plan Review and the load report: the window opened by Begin Loading and by a
// finished load's report. A container: it reads the planner model with
// usePlanner() and hands LoadingModal what it shows. Mount it anywhere under
// PlannerProvider.

import LoadingModal from "../modals/LoadingModal";
import { styles } from "../ui/styles";
import { usePlanner } from "../PlannerContext";

export default function PlanReviewFlow() {
  const {
    shell,
    effectiveUserId,
    loadWorkflow,
    setCompPlan,
    effectivePlanRows,
    capOverridesForReview,
    persistedCapForComp,
    livePreviewGrossLbs,
    livePreviewDiffLbs,
    targetWeight,
    unavailableComps,
    productNameById,
    productHexCodeById,
    productInputsForModal,
    tuneRows,
    onTuneProduct,
    tuneTempColor,
    fuelTempAmbientF,
    terminalLabel,
    selectedRackName,
    fuelTankGallons,
    saveFuelTankGallons,
    recentFuelPct,
    tripModeForLoading,
    recordTripLoaded,
    loadGeoShips,
    reportFromDashboard,
    handleTapTerminalInLoadingModal,
    handleBackToPlannerNoUpdate,
    openCancelLoadSheet,
    supplierPanel,
  } = usePlanner();

  return (
    <LoadingModal
      supplierSection={supplierPanel}
      open={loadWorkflow.loadingOpen}
      onClose={() => {
        /* no accidental dismissal -- exits are the explicit buttons */
      }}
      userId={effectiveUserId}
      styles={styles}
      planRows={effectivePlanRows as any[]}
      capOverrides={capOverridesForReview}
      productNameById={productNameById}
      productHexCodeById={productHexCodeById}
      productInputs={productInputsForModal}
      equipmentLabel={shell.equipment.equipmentLabel}
      terminalLabel={terminalLabel}
      locationLabel={shell.location.locationLabel}
      rackName={selectedRackName}
      onTapTerminal={handleTapTerminalInLoadingModal}
      onSetCompartmentCap={(comp, capGallons) => {
        // Tap-to-adjust in Plan Review sets the compartment CAP (feeds the
        // weight-bounded solver -> can't overload), not a raw gallons
        // override. Bounded to the physical cap; recomputes the plan live.
        const physical = persistedCapForComp(comp);
        const clamped = Math.max(0, Math.min(physical || capGallons, Math.round(capGallons)));
        setCompPlan((prev: any) => ({
          ...prev,
          [comp]: { ...(prev[comp] ?? { empty: false, productId: "" }), capOverride: clamped },
        }));
      }}
      persistedCapForComp={persistedCapForComp}
      livePreviewGrossLbs={livePreviewGrossLbs}
      livePreviewDiffLbs={livePreviewDiffLbs}
      targetWeight={targetWeight}
      report={
        loadWorkflow.reportLines
          ? {
              lines: loadWorkflow.reportLines,
              actualGrossLbs: loadWorkflow.loadReport?.actual_gross_lbs ?? null,
            }
          : null
      }
      onNewLoad={loadWorkflow.closeLoadReport}
      onEditLoad={(entries, extras) =>
        loadWorkflow.onLoadedFromLoadingModal(entries, {
          loadId: loadWorkflow.reportLoadId ?? undefined,
          afterTripRecord: () => recordTripLoaded(extras, true),
        })
      }
      onDeleteLoad={loadWorkflow.deleteReportedLoad}
      deleteBusy={loadWorkflow.reportBusy}
      deleteError={loadWorkflow.reportError}
      onLoaded={(entries, extras) =>
        loadWorkflow.onLoadedFromLoadingModal(entries, extras ? { afterTripRecord: () => recordTripLoaded(extras, false) } : undefined)
      }
      trip={tripModeForLoading}
      onFinishLoadingStart={loadGeoShips}
      onUpdateCardOnly={() => loadWorkflow.cancelActiveLoad()}
      onReportTerminalIssue={() => openCancelLoadSheet()}
      onBackToPlanner={handleBackToPlannerNoUpdate}
      onAdjustPlan={handleBackToPlannerNoUpdate}
      loadedDisabled={loadWorkflow.completeBusy}
      loadedLabel={loadWorkflow.completeBusy ? "Saving…" : "Finish Loading"}
      returnLabel={reportFromDashboard ? "Back to Dashboard" : undefined}
      errorMessage={loadWorkflow.completeError}
      allPlannedUnavailable={unavailableComps.length > 0}
      tuneRows={tuneRows}
      onTuneProduct={onTuneProduct}
      tuneTempColor={tuneTempColor}
      ambientTempF={fuelTempAmbientF}
      fuelTankGallons={fuelTankGallons}
      liveFuelPct={recentFuelPct}
      onSaveFuelTankGallons={saveFuelTankGallons}
    />
  );
}
