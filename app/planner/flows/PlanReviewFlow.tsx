"use client";
// app/planner/flows/PlanReviewFlow.tsx
//
// Plan Review and the load report: the window opened by Begin Loading and by a
// finished load's report. A container: it reads the planner model with
// usePlanner() and hands LoadingModal what it shows. Mount it anywhere under
// PlannerProvider.

import { useState } from "react";
import ConnectedSupplierPanel from "../components/ConnectedSupplierPanel";
import RackDelaySheet from "../components/RackDelaySheet";
import { readRunningDelay, writeRunningDelay, type RunningDelay } from "@/lib/trips/delays";
import { reportRows } from "../utils/reportRows";
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
    handleCouldntLoad,
    handleSubmitOutageReport,
    tripPickup,
    tripWaitingPickup,
    compPlan,
    terminalProducts,
  } = usePlanner();

  // ── Rack Delay: a reason starts the running delay (same one the dashboard's Delay button shows) and warns
  // other drivers headed to this terminal. Plan Review stays open.
  const [rackDelayOpen, setRackDelayOpen] = useState(false);
  const rackProducts = [...new Map(
    reportRows(effectivePlanRows as any[], compPlan as any, (terminalProducts ?? []) as any[])
      .filter((r) => r?.productId && Number(r.planned_gallons ?? 0) > 0)
      .map((r) => [String(r.productId), { productId: String(r.productId), name: productNameById?.get(String(r.productId)) ?? "Product" }]),
  ).values()];
  const startRackDelay = async (code: any, productIds: string[]): Promise<string | null> => {
    const pickup = tripPickup ?? tripWaitingPickup ?? null;
    if (effectiveUserId && pickup && !readRunningDelay(effectiveUserId)) {
      const d: RunningDelay = { tripId: pickup.trip_id, leg: "at_rack", code, note: null, startedAt: new Date().toISOString(), pickupId: pickup.pickup_id, deliveryId: null };
      writeRunningDelay(effectiveUserId, d);
      try { window.dispatchEvent(new Event("protankr:delay")); } catch { /* not a browser */ }
    }
    const r = await handleSubmitOutageReport(code, productIds);
    return r?.error ? "The delay started, but the warning to other drivers didn't go out. Try again from the Terminal sheet." : null;
  };

  return (
    <>
    <LoadingModal
      supplierSection={<ConnectedSupplierPanel />}
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
      onUpdateCardOnly={handleCouldntLoad}
      onRackDelay={() => setRackDelayOpen(true)}
      // Back to Planner leaves the load, the arrival time and the card exactly as they are.
      onBackToPlanner={() => loadWorkflow.setLoadingOpen(false)}
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
    {/* After Plan Review in the page, so it stacks above it. */}
    <RackDelaySheet open={rackDelayOpen} products={rackProducts} onClose={() => setRackDelayOpen(false)} onSubmit={startRackDelay} />
    </>
  );
}
