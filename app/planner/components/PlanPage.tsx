"use client";
// app/planner/components/PlanPage.tsx
//
// The Planner's plan page (shown only on bare /planner): location line, plan
// compartments, CG slider, summary and plan actions, plus the setup gates. Reads the
// planner model with usePlanner(); holds layout only.

import { detourActive, finishDetour, RESUME_URL } from "@/lib/trips/planDetour";
import { createPortal } from "react-dom";
import { Spinner } from "@/lib/ui/pending";
import { TripEquipmentSheets } from "./trip/TripEquipmentSheets";
import { styles } from "../ui/styles";
import { usePlanner } from "../PlannerContext";
import PlanCompartmentsSection from "./PlanCompartmentsSection";
import PlanActionsSection from "./PlanActionsSection";
import SetupSessionBanner from "./SetupSessionBanner";
import { PartialEquipmentPanel } from "./PartialEquipmentPanel";
import { PlannerGates } from "./PlannerGates";

export default function PlanPage() {
  const {
    LANDSCAPE_MAX_W,
    active,
    activeSlotLetter,
    cgSlider,
    compError,
    compLoading,
    compPlan,
    compartments,
    currentOverrides,
    effectiveMaxGallonsForComp,
    effectivePlanRows,
    effectivePlannedGallonsTotal,
    equipment,
    equipmentDetails,
    headerIconsSlot,
    isDirty,
    isLandscape,
    leaveTo,
    leaving,
    livePreviewGrossLbs,
    location,
    onboardingActive,
    openEquipment,
    persistedCapForComp,
    planRows,
    planSlotWithLayout,
    planSlots,
    planUsesReferenceApi,
    plannedGallonsByComp,
    reportPending,
    selectedComp,
    selectedTrailerId,
    setActiveSlotLetter,
    setBaselineOverrides,
    setCgSlider,
    setCompModalComp,
    setCompModalOpen,
    setCompPlan,
    setOnboardingDone,
    setPresetQuickPickOpen,
    setWizardNew,
    setupSession,
    targetWeight,
    terminalLabel,
    terminalProducts,
    tripEquip,
    unstableLoad
  } = usePlanner();
  // A driver holding only a truck or only a trailer has no tare or compartments, so the
  // plan is replaced by a prompt to pick the missing unit and cannot load.
  const isPartialEquipment = equipment.isBobtail || equipment.isTrailerOnly;

  // Landscape trims the page padding and raises the max width (1100 elsewhere).
  const pageStyle = isLandscape
    ? { ...styles.page, padding: 6, maxWidth: 1800 }
    : styles.page;
  const stabilityBannerEl = unstableLoad ? (
    <div style={{ ...styles.error, marginTop: 0, marginBottom: 12, textAlign: "center" as const }}>
      ⚠️ Unstable load (rear of neutral)
    </div>
  ) : null;


  return (
    <div style={active ? pageStyle : { display: "none" }}>
      {(leaving || reportPending) && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 49, background: "#0b0b0b", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(255,255,255,0.55)", fontSize: 15 }}>
          <Spinner size={14} />{leaving ?? "Opening load report…"}
        </div>,
        document.body,
      )}
      {setupSession && <SetupSessionBanner targetDisplayName={setupSession.targetDisplayName} returnTo={setupSession.returnTo} />}

      {/* One content column in both orientations (capped in landscape). */}
      <div style={isLandscape ? { maxWidth: LANDSCAPE_MAX_W, margin: "0 auto" } : undefined}>
      <TripEquipmentSheets {...tripEquip.sheets} />
      {isPartialEquipment ? (
        <PartialEquipmentPanel
          isBobtail={equipment.isBobtail}
          truckName={equipment.currentTruckName}
          trailerName={equipment.currentTrailerName}
          onSelect={openEquipment}
        />
      ) : (
      <>
      {stabilityBannerEl}
      <PlanCompartmentsSection
        selectedTrailerId={selectedTrailerId}
        compLoading={compLoading}
        compError={compError}
        compartments={compartments}
        persistedCapForComp={persistedCapForComp}
        effectiveMaxGallonsForComp={effectiveMaxGallonsForComp}
        plannedGallonsByComp={plannedGallonsByComp}
        compPlan={compPlan}
        setCompPlan={setCompPlan}
        terminalProducts={terminalProducts}
        selectedComp={selectedComp}
        selectedTerminalId={location.selectedTerminalId ?? ""}
        isLandscape={isLandscape}
        cgSlider={cgSlider}
        setCgSlider={setCgSlider}
        hasCombo={!!equipment.selectedCombo}
        onChangeProduct={(n) => { setCompModalComp(n); setCompModalOpen(true); }}
      />
      </>
      )}
      </div>
      {active && headerIconsSlot && createPortal(
        equipmentDetails.trailerName ? (
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.3, color: "rgba(255,255,255,0.5)" }}>
            {equipmentDetails.trailerName}
          </span>
        ) : null,
        headerIconsSlot,
      )}
      {!isPartialEquipment && (
        <PlanActionsSection
          isLandscape={isLandscape}
          maxWidth={LANDSCAPE_MAX_W}
          plannedGallons={effectivePlanRows.length ? effectivePlannedGallonsTotal : null}
          grossLbs={effectivePlanRows.length ? livePreviewGrossLbs : null}
          targetWeight={targetWeight}
          showRefApiWarning={!active && planUsesReferenceApi && planRows.length > 0}
          planLetter={String.fromCharCode(64 + activeSlotLetter)}
          planPickerDisabled={!planSlots.presetsReady}
          onOpenPlans={() => setPresetQuickPickOpen(true)}
          isDirty={isDirty}
          onNewOrSave={() => {
            if (isDirty) {
              const to = planSlotWithLayout(compPlan, activeSlotLetter) ?? activeSlotLetter;
              planSlots.saveToSlot(to);
              setActiveSlotLetter(to);
              setBaselineOverrides(currentOverrides);
              if (detourActive()) { finishDetour(to); leaveTo(RESUME_URL, "Back to your trip…"); }
            } else setWizardNew(true);
          }}
          closing={!!leaving}
          onClose={() => {
            if (detourActive()) {
              const snap = planSlots.peekSlot(activeSlotLetter);
              const has = !!snap && Object.values(snap.compPlan ?? {}).some((c: any) => c && !c.empty && c.productId);
              finishDetour(has ? activeSlotLetter : null); leaveTo(RESUME_URL, "Back to your trip…"); return; }
            leaveTo("/planner/home", "Opening dashboard…");
          }}
        />
      )}

      <PlannerGates
        onboardingActive={onboardingActive}
        active={active}
        terminalLabel={terminalLabel ?? ""}
        onOnboardingComplete={() => setOnboardingDone(true)}
      />
    </div>
  );
}
