"use client";
import { useTruckReading } from "@/lib/telematics/useTruckReading";
import { usePathname, useRouter } from "next/navigation";
import { PartialEquipmentPanel } from "./components/PartialEquipmentPanel";
import { PlannerGates } from "./components/PlannerGates";
import { useCalculatorShell } from "./CalculatorShellContext";

/**
 * page.tsx — CalculatorPage
 *
 * This file is intentionally thin: it wires hooks together and renders JSX.
 * Business logic lives in:
 *   hooks/useEquipment.ts   — combos, selectedComboId, persistence
 *   hooks/useLocation.ts    — states/cities, ambient temp, persistence
 *   hooks/useTerminals.ts   — my terminals, catalog, get_carded
 *   hooks/usePlanSlots.ts   — plan snapshot save/load, Supabase sync
 *   hooks/useLoadWorkflow.ts — begin_load / complete_load RPCs
 *   hooks/usePlanRows.ts    — binary search for weight-constrained max gallons
 *   utils/planMath.ts       — lbsPerGallonAtTemp, planForGallons, allocateWithCaps
 *   types.ts                — all shared types
 */



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── Hooks ──────────────────────────────────────────────────────────────────────
import { usePlanSlots } from "./hooks/usePlanSlots";
import { useLoadWorkflow } from "./hooks/useLoadWorkflow";
import { useTripLoading } from "./hooks/useTripLoading";
import { usePlanMath } from "./hooks/usePlanMath";
import { useUnavailableProducts } from "./hooks/useUnavailableProducts";
import { usePlannerIntents } from "./hooks/usePlannerIntents";
import PlanCompartmentsSection from "./components/PlanCompartmentsSection";
import PlanActionsSection from "./components/PlanActionsSection";
import { useLoadBegin } from "./hooks/useLoadBegin";
import { useLoadPrep } from "./hooks/useLoadPrep";
import { usePlanTemperature } from "./hooks/usePlanTemperature";
import { usePlanSlotsView } from "./hooks/usePlanSlotsView";
import { PlannerProvider, type PlannerCtx } from "./PlannerContext";
import PlanReviewFlow from "./flows/PlanReviewFlow";
import PlanSlotsFlow from "./flows/PlanSlotsFlow";
import CompartmentFlow from "./flows/CompartmentFlow";
import PlanBuilderFlow from "./flows/PlanBuilderFlow";
import TerminalSwitchFlow from "./flows/TerminalSwitchFlow";
import ReportIssueFlow from "./flows/ReportIssueFlow";
import StaleApiFlow from "./flows/StaleApiFlow";
import RecallEquipmentFlow from "./flows/RecallEquipmentFlow";
import TempConfirmFlow from "./flows/TempConfirmFlow";
import { usePlanInputs } from "./hooks/usePlanInputs";
import { usePlanDirty } from "./hooks/usePlanDirty";
import SetupSessionBanner from "./components/SetupSessionBanner";
import { usePlannerSuppliers } from "./hooks/usePlannerSuppliers";
import { usePlannerEquipment } from "./hooks/usePlannerEquipment";
import { useTerminalProducts } from "./hooks/useTerminalProducts";
import { useLoadReportLauncher } from "./hooks/useLoadReportLauncher";
import { useTerminalSwitchDuringLoad } from "./hooks/useTerminalSwitchDuringLoad";

// ── Sections ───────────────────────────────────────────────────────────────────
import { useIsLandscape } from "./hooks/useOrientation";
import { useLeaveTo } from "./hooks/useLeaveTo";
import { usePlannerLanding } from "./hooks/usePlannerLanding";
import { useHeaderIconsSlot } from "./hooks/useHeaderIconsSlot";
import { getTripPlan, markTripPlanApplied, takeTripQuick } from "@/lib/trips/tripPlan";

// ── Modals ─────────────────────────────────────────────────────────────────────
// LocationModal/MyTerminalsModal now mount once in ShellChrome
// (CalculatorLayoutClient.tsx) -- see the render-site comment further down.
import { type StaleProduct } from "./components/StaleApiOverlay";

// ── UI ─────────────────────────────────────────────────────────────────────────
import { styles } from "./ui/styles";

// ── Utils ──────────────────────────────────────────────────────────────────────
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { TripEquipmentSheets, useTripEquipment } from "./hooks/useTripEquipment";
import { SupplierPanel } from "./components/supplier/SupplierPanel";
import { useSupplierPicks } from "@/lib/suppliers/useSupplierPicks";
import { markSuppliersLoaded } from "@/lib/suppliers/useTerminalSuppliers";
import { Spinner } from "@/lib/ui/pending";

// ── Types ──────────────────────────────────────────────────────────────────────
import type { CompPlanInput, ProductRow } from "./types";



// ─── Local UI helpers ─────────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────────────────────


export default function PlannerHost() {
  // ── Shared shell state (equipment/location/terminals/expirations) ──────────
  // Equipment, location and terminals are owned once in CalculatorShellContext, so the
  // header and this host never hold two copies of the same selection.
  const shell = useCalculatorShell();
  const { setupSession, effectiveUserId, equipment, location, terminals } = shell;
  const router = useRouter();
  // This host stays mounted for every /planner screen; the plan page itself shows only
  // on bare /planner. The windows (Plan Review, load report, sheets) work on any screen.
  const pathname = usePathname();
  const active = pathname === "/planner";
  const { leaving, leaveTo } = useLeaveTo(pathname);
  // Wider than tall with room for the side rail (see useOrientation.ts).
  const isLandscape = useIsLandscape();
  // In landscape the plan is one column, capped so it does not stretch across a
  // large monitor. Compartment bars are a percentage of the column; their height is fixed.
  const LANDSCAPE_MAX_W = 1100;

  const { setOnboardingDone, onboardingActive } = usePlannerLanding(active);

  const headerIconsSlot = useHeaderIconsSlot(isLandscape);

  // ── Window state ───────────────────────────────────────────────────────────
  // The equipment, location, terminal and expirations windows are open/closed in the
  // shell, because the header opens them too.
  const [compModalOpen, setCompModalOpen] = useState(false);
  const [compModalComp, setCompModalComp] = useState<number | null>(null);
  const [tempDialOpen, setTempDialOpen] = useState(false);
  // The Finish Loading choice sheet (log the load / update card only / keep editing).
  const [cancelLoadConfirmOpen, setCancelLoadConfirmOpen] = useState(false);
  // The terminal's access date before begin_load re-carded it, so "Back to Planner" can
  // undo that. A null prevValue means there was no prior record.
  const preLoadCardedOnRef = useRef<{ terminalId: string; prevValue: string | null } | null>(null);

  // ── Stale-API safety ───────────────────────────────────────────────────────
  // Per-product API override that forces a heavier density when the driver chose
  // Safest/Safe for a stale reading. Cleared when Plan Review closes.
  const [apiSafetyOverride, setApiSafetyOverride] = useState<Record<string, number>>({});
  // Per-product API and temperature the driver tuned in Plan Review. Overrides the
  // density basis for that product. Cleared when Plan Review closes.
  const [tunedApiTempByProduct, setTunedApiTempByProduct] = useState<Record<string, { api: number; tempF: number }>>({});
  // The stale-API decision overlay's own open state + which products it lists.
  const [staleApiPrompt, setStaleApiPrompt] = useState<{ products: StaleProduct[] } | null>(null);
  // A stale-API choice sets the override and flips this; an effect then begins the load
  // on the next render, once the plan has recomputed against the override.
  const [beginAfterOverride, setBeginAfterOverride] = useState(false);

  // ── Action row state ───────────────────────────────────────────────────────
  // activeSlotLetter is the plan letter on screen. Every load is tagged with it.
  // selectedComp is the compartment last tapped.
  const [activeSlotLetter, setActiveSlotLetter] = useState(1);
  const [selectedComp, setSelectedComp] = useState<number | null>(null);
  // usePlanSlots calls this when the live plan restores, to put the plan letter back.
  const handlePlanRestored = useCallback((slot: number | null) => {
    if (slot != null) setActiveSlotLetter(slot);
  }, []);
  // Holds back seeding blank compartment entries until usePlanSlots has tried to restore
  // the saved plan for this combo; otherwise a blank plan could be autosaved over it.
  const [planRestoreAttempted, setPlanRestoreAttempted] = useState(false);
  const handleRestoreAttempted = useCallback(() => {
    setPlanRestoreAttempted(true);
  }, []);
  // Recall Last Load found a load at this terminal under different equipment. Informational
  // only: it links to that load's report and never switches equipment.
  const [altEquipmentPrompt, setAltEquipmentPrompt] = useState<{ loadId: string; truckLabel: string; trailerLabel: string } | null>(null);

  // ── Feature hooks ──────────────────────────────────────────────────────────
  // equipment/location/terminals come from the shared shell context (see above).

  // Resolve timezone after both hooks exist
  // ── Compartments ───────────────────────────────────────────────────────────
  const {
    compartments, setCompartments, compLoading, compError, selectedTrailerId,
    equipmentDetails, selectedTruckId, fuelTankGallons, saveFuelTankGallons,
  } = usePlannerEquipment(equipment);

  // ── Terminal products ──────────────────────────────────────────────────────
  const { terminalProductsRaw, fetchTerminalProducts, selectedRackName } = useTerminalProducts(location);
  const { data: catalogProducts } = useProductsCatalog();
  // The Plan page needs no terminal: it lays plans out from the whole catalog
  // at each product's published minimum API (heaviest) and 60 F, so there is
  // always an example layout. Plan Review / loading, which run over other
  // screens, keep using the selected terminal's own products and readings.
  const planCatalogProducts = useMemo(
    () => (catalogProducts ?? [])
      .filter((p) => p.active !== false && p.api_60 != null && p.alpha_per_f != null)
      .map((p) => ({ ...p, last_api: null, last_temp_f: null, last_api_updated_at: null, min_api_observed: null })) as unknown as ProductRow[],
    [catalogProducts],
  );
  const terminalProducts = useMemo(() => (active ? planCatalogProducts : terminalProductsRaw), [active, planCatalogProducts, terminalProductsRaw]);

  // ── Planning inputs ────────────────────────────────────────────────────────
  // ── Persisted plan state — survives page refresh ─────────────────────────
  // All initialized to defaults; hydrated from localStorage in useEffect after mount
  // (avoids SSR hydration mismatch — localStorage is client-only)
  const { tempF, setTempF, tempFRef, productTempF, setProductTempF, setSingleProductTempF, cgSlider, setCgSlider } = usePlanInputs();

  // The live plan. usePlanSlots owns saving and restoring it (combo-scoped, not per
  // terminal), so there is no separate cache here.
  const [compPlan, setCompPlan] = useState<Record<number, CompPlanInput>>({});

  // Shares the planned product ids with the shell so the outage banner can show only
  // relevant reports. Pushed only when the set changes, not on every plan edit.
  const plannedProductIdsSigRef = useRef<string>("");
  useEffect(() => {
    const ids = Array.from(new Set(
      Object.values(compPlan)
        .filter((c) => !c.empty && c.productId)
        .map((c) => c.productId)
    )).sort();
    const sig = ids.join(",");
    if (sig === plannedProductIdsSigRef.current) return;
    plannedProductIdsSigRef.current = sig;
    shell.setPlannedProductIds(new Set(ids));
  }, [compPlan, shell.setPlannedProductIds]);

  const { overridesSnapshot, baselineOverrides, setBaselineOverrides, setCaptureBaselineNext } = usePlanDirty(compPlan, cgSlider);
  // A terminal or combo switch restores the plan asynchronously; recapture the unsaved-
  // changes baseline once it lands instead of comparing against the old plan.
  useEffect(() => {
    setCaptureBaselineNext(true);
  }, [location.selectedTerminalId, equipment.selectedComboId]);

  // usePlanSlots only restores while a combo is selected, so clear the plan when none is.
  useEffect(() => {
    if (!equipment.selectedComboId) setCompPlan({});
  }, [equipment.selectedComboId]);
  // Re-gate seeding for every new combo.
  useEffect(() => {
    setPlanRestoreAttempted(false);
  }, [equipment.selectedComboId]);
  const [productInputs, setProductInputs] = useState<Record<string, { api?: string; tempF?: number }>>({});
  const setProductApi = useCallback((productId: string, api: string) => {
    setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), api } }));
  }, []);
  const setProductTemp = useCallback((productId: string, tempFVal: number) => {
    setProductInputs((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? {}), tempF: tempFVal } }));
  }, []);

  const {
    predictedFuelTempF, fuelTempConfidence, fuelTempLoading, fuelTempAmbientF, fuelTempUnbiasedF, refreshFuelTemp, userAdjustedTempRef,
  } = usePlanTemperature({ location, effectiveUserId, tempF, setTempF });

  // Seed a blank entry for each real compartment and drop entries for ones that no
  // longer exist. Waits for the restore attempt (see planRestoreAttempted).
  useEffect(() => {
    if (!planRestoreAttempted) return;
    setCompPlan((prev: Record<number, CompPlanInput>) => {
      const next = { ...prev };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        if (!next[n]) next[n] = { empty: false, productId: "" };
      }
      // Only prune against a loaded compartment list; an empty one means "not loaded yet".
      if (compartments.length > 0) {
        for (const key of Object.keys(next)) {
          const n = Number(key);
          if (!compartments.some((c) => Number(c.comp_number) === n)) delete next[n];
        }
      }
      return next;
    });
  }, [compartments, planRestoreAttempted]);

  const { apiBasisForProduct, capOverridesForReview, capacityResult, cgBias, effectiveMaxGallonsForComp, effectivePlanRows, effectivePlannedGallonsTotal, effectivePlannedWeightLbs, lbsPerGalForProductId, livePreviewDiffLbs, livePreviewGrossLbs, persistedCapForComp, planRows, planUsesReferenceApi, plannedGallonsByComp, plannedProductIds, setLoadingGallonsOverride, tare, targetWeight, tripStoreHook, unstableLoad } = usePlanMath({ active, apiSafetyOverride, catalogProducts, cgSlider, compPlan, compartments, effectiveUserId, equipment, productTempF, selectedTrailerId, setCompPlan, setProductTempF, tempF, terminalProducts, tunedApiTempByProduct });

  // ── Plan slots ─────────────────────────────────────────────────────────────
  // Must be declared BEFORE loadWorkflow so planSlots.refreshLastLoad is defined
  const planSlots = usePlanSlots({
    authUserId: effectiveUserId, selectedTerminalId: location.selectedTerminalId, selectedComboId: equipment.selectedComboId,
    tempF, compPlan, setCompPlan,
    cgSlider, setCgSlider,
    compartmentsLoaded: compartments.length > 0,
    activeSlotLetter,
    onPlanRestored: handlePlanRestored,
    onRestoreAttempted: handleRestoreAttempted,
  });

  // ── Load workflow ──────────────────────────────────────────────────────────
  const { productNameById, setCheckAvailabilityNext, unavailableComps } = useUnavailableProducts({ compModalOpen, compPlan, setCompModalComp, setCompModalOpen, setSelectedComp, terminalProducts });

  const supplierPicks = useSupplierPicks(effectiveUserId || null, location.selectedTerminalId ? String(location.selectedTerminalId) : null);
  const supplierPicksRef = useRef(supplierPicks);
  supplierPicksRef.current = supplierPicks;
  // Picks resolved against the current plan (set below, once products are known).
  const resolvedSupplierPicksRef = useRef<{ product_id: string; supplier_id: string | null; name: string }[]>([]);

  const loadWorkflow = useLoadWorkflow({
    authUserId: effectiveUserId || null,
    selectedComboId: equipment.selectedComboId,
    selectedTerminalId: location.selectedTerminalId,
    selectedRackId: location.selectedRackId,
    selectedState: location.selectedState,
    selectedCity: location.selectedCity,
    selectedCityId: location.selectedCityId,
    tare, cgBias,
    ambientTempF: location.ambientTempF,
    tempF, planRows: effectivePlanRows, plannedGallonsTotal: effectivePlannedGallonsTotal, plannedWeightLbs: effectivePlannedWeightLbs,
    terminalProducts, productNameById,
    productInputs, setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalProducts: fetchTerminalProducts,
    onRefreshTerminalAccess: terminals.refreshTerminalAccessForUser,
      // After a load is logged the temp entered becomes the next plan's anchor: clear any
    // manual dial nudge and refetch the prediction.
    onPostLoadComplete: async () => {
      // The suppliers this load ran on worked here: stamp them and clear any
      // "not working" flag, then forget the picks for the next visit.
      const sp = supplierPicksRef.current;
      const ids = resolvedSupplierPicksRef.current.map((p) => p.supplier_id).filter((x): x is string => !!x);
      if (ids.length && shell.companyId && location.selectedTerminalId && effectiveUserId) {
        void markSuppliersLoaded(shell.companyId, String(location.selectedTerminalId), ids, effectiveUserId);
      }
      sp.clear();
      userAdjustedTempRef.current = false;
      refreshFuelTemp();
      await planSlots.refreshLastLoad();
    },
    predictedTempF: predictedFuelTempF,
    unbiasedPredictedTempF: fuelTempUnbiasedF,
    activeSlotLetter,
    capacityResult,
  });

  // The truck's own fuel level (telematics), used only when recent.
  const fuelReading = useTruckReading(selectedTruckId ?? null, loadWorkflow.loadingOpen);
  const recentFuelPct = fuelReading?.fuelLevelPct != null && fuelReading.at && Date.now() - Date.parse(fuelReading.at) < 30 * 60_000 ? fuelReading.fuelLevelPct : null;

  const {
    tripStoreObj, tripSuppliers, addTripSupplier, loadGeoShips,
    tripPickup, tripWaitingPickup, tripNeedsArrive, tripModeForLoading, recordTripLoaded,
  } = useTripLoading({ shell, active, effectiveUserId, loadWorkflow, tripStoreHook, supplierPicks, plannedProductIds, compPlan, leaveTo });

  const { handleBackToPlannerNoUpdate, handleRecallLastLoad, handleSubmitOutageReport, requestBegin } = useLoadBegin({ beginAfterOverride, effectiveUserId, loadWorkflow, planSlots, preLoadCardedOnRef, predictedFuelTempF, refreshFuelTemp, resolvedSupplierPicksRef, setActiveSlotLetter, setAltEquipmentPrompt, setApiSafetyOverride, setBeginAfterOverride, setCancelLoadConfirmOpen, setCaptureBaselineNext, setProductTempF, setTempF, setTunedApiTempByProduct, shell, tempFRef, userAdjustedTempRef });

  const { reportPending, reportFromDashboard, openLoadReportAtTerminal } = useLoadReportLauncher({ shell, loadWorkflow, leaveTo });

  // Never claims or switches equipment (someone else may be driving it); links to the
  // load's read-only report instead.
  const handleViewAltLoadInReports = useCallback(() => {
    if (!altEquipmentPrompt) return;
    router.push(`/planner/reports?loadId=${encodeURIComponent(altEquipmentPrompt.loadId)}`);
    setAltEquipmentPrompt(null);
  }, [altEquipmentPrompt, router]);

  // ── Derived labels ─────────────────────────────────────────────────────────
  const terminalLabel = useMemo(() => {
    if (!location.selectedTerminalId) return undefined;
    const t = terminals.terminals.find((t) => String(t.terminal_id) === String(location.selectedTerminalId))
      ?? terminals.terminalCatalog.find((t) => String(t.terminal_id) === String(location.selectedTerminalId));
    return t?.terminal_name ? String(t.terminal_name) : "Terminal";
  }, [terminals.terminals, terminals.terminalCatalog, location.selectedTerminalId]);

  const {
    terminalSwitchConfirm,
    handleTapTerminalInLoadingModal,
    handleUpdateCardAtPrevious,
    handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal,
    tempReconfirmProductIds,
    setTempReconfirmProductIds,
    handleConfirmTempReconfirm,
    switchReportedIssueRef,
    switchReasonNoteRef,
  } = useTerminalSwitchDuringLoad({
    shell, loadWorkflow, tripStoreHook, tripPickup, tripWaitingPickup, effectiveUserId, terminalLabel,
    effectivePlanRows: effectivePlanRows as any[], setProductApi, setProductTemp, setTunedApiTempByProduct,
    userAdjustedTempRef, setTempDialOpen, setTempF, tempF, fuelTempLoading, predictedFuelTempF,
    handleSubmitOutageReport,
  });

  // Last API reading per product, from terminalProducts (refreshed after a load is logged).
  const lastProductInfoById = useMemo(() => {
    const out: Record<string, { last_api: number | null; last_api_updated_at: string | null }> = {};
    for (const p of terminalProducts) {
      const pid = String((p as any).product_id ?? "");
      if (!pid) continue;
      out[pid] = {
        last_api: (p as any).last_api ?? null,
        last_api_updated_at: (p as any).last_api_updated_at ?? null,
      };
    }
    return out;
  }, [terminalProducts]);

  const productHexCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) { if (p.product_id && p.hex_code) rec[p.product_id] = String(p.hex_code); }
    return rec;
  }, [terminalProducts]);

  // Short code for the Tune panel (product code, not the full label) -- same
  // fallback chain the compartment bars already use.
  const productCodeById = useMemo(() => {
    const rec: Record<string, string> = {};
    for (const p of terminalProducts) {
      if (!p.product_id) continue;
      const code = (p as any).button_code || (p as any).product_code || String(p.product_name ?? "").split(/\s+/)[0] || "";
      rec[p.product_id] = String(code);
    }
    return rec;
  }, [terminalProducts]);

  const { supplierPanelProducts, resolvedSupplierPicks, supplierPromptToken, onSupplierPicks, onSupplierSwitched } = usePlannerSuppliers({
    shell, effectiveUserId, loadWorkflow, tripStoreHook, tripStoreObj, tripPickup, tripWaitingPickup,
    supplierPicks, resolvedSupplierPicksRef, plannedProductIds, productCodeById, productNameById, productHexCodeById,
  });

  const { handleConfirmTempAndBeginLoad, handleStaleIgnore, handleStaleSafe, handleStaleSafest, loadDisabled, onTuneProduct, productInputsForModal, tempModalProductGroups, tuneRows, tuneTempColor } = useLoadPrep({ apiBasisForProduct, equipment, fuelTempConfidence, lastProductInfoById, lbsPerGalForProductId, loadWorkflow, location, planRows, plannedProductIds, productCodeById, productHexCodeById, productInputs, productNameById, productTempF, requestBegin, setProductApi, setProductTemp, setSingleProductTempF, setStaleApiPrompt, setTempDialOpen, setTunedApiTempByProduct, staleApiPrompt, tempF, terminalProducts, tunedApiTempByProduct });

  // Mid-trip equipment change, shared with the Driver Dashboard: warning
  // before the picker, and the truck-change record when a loaded trailer is
  // now behind a different truck.
  const tripEquip = useTripEquipment(tripStoreHook, effectiveUserId || null);
  const openEquipment = tripEquip.openEquipment;

  usePlannerIntents({ effectiveUserId, loadDisabled, loadWorkflow, openLoadReportAtTerminal, planSlots, plannedProductIds, requestBegin, shell, tripNeedsArrive, tripStoreHook, unavailableComps });

  const {
    presetSheetSlot, setPresetSheetSlot, presetQuickPickOpen, setPresetQuickPickOpen,
    summaryForSlot, presetSheetSummary, nameForSlot, colorsForSlot,
    handlePresetLoad, handlePresetSaveEmpty, handlePresetSheetLoad, handlePresetSheetEdit, handlePresetSheetClear, closePresetSheet,
    planSlotWithLayout, wizardNew, setWizardNew, wizardOpen, canSetCap, handleWizardSaveCaps, handleWizardFinish,
  } = usePlanSlotsView({
    shell, active, planSlots, productNameById, compartments, setCompartments, compLoading, selectedTrailerId, compPlan, cgSlider,
    activeSlotLetter, setActiveSlotLetter, setCaptureBaselineNext, setCheckAvailabilityNext, setBaselineOverrides,
    overridesSnapshot, planRestoreAttempted, onboardingActive, setupSession, loadWorkflow,
  });
  // (closes the compartment window; kept next to its state)
  const closeCompModal = () => { setCompModalOpen(false); setCompModalComp(null); setSelectedComp(null); };
  // The plan picked on Begin Trip: loaded the first time the Planner opens
  // for that trip (once presets have synced), then left alone.
  const tripPlanTripId = tripWaitingPickup?.trip_id ?? null;
  useEffect(() => {
    if (!effectiveUserId || !tripPlanTripId || !planSlots.presetsReady || !equipment.selectedComboId) return;
    const pending = getTripPlan(effectiveUserId, tripPlanTripId);
    if (!pending || pending.applied) return;
    markTripPlanApplied(effectiveUserId, tripPlanTripId);
    if (!planSlots.peekSlot(pending.slot)) return;
    handlePresetLoad(pending.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, tripPlanTripId, planSlots.presetsReady, equipment.selectedComboId]);
  // Quick load from dispatch: its layout runs with no caps and CG centered,
  // once, and nothing is saved.
  const quickTripId = tripWaitingPickup?.trip_id ?? null;
  useEffect(() => {
    if (!effectiveUserId || !quickTripId || !planSlots.presetsReady || !equipment.selectedComboId || compartments.length === 0) return;
    if (!takeTripQuick(effectiveUserId, quickTripId)) return;
    setCompPlan((prev: Record<number, CompPlanInput>) => {
      const next: Record<number, CompPlanInput> = {};
      for (const [k, v] of Object.entries(prev)) next[Number(k)] = { ...v, capOverride: undefined };
      return next;
    });
    setCgSlider(0.5);
    setCaptureBaselineNext(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUserId, quickTripId, planSlots.presetsReady, equipment.selectedComboId, compartments.length]);

  const stabilityBannerEl = unstableLoad ? (
    <div style={{ ...styles.error, marginTop: 0, marginBottom: 12, textAlign: "center" as const }}>
      ⚠️ Unstable load (rear of neutral)
    </div>
  ) : null;

  const currentOverrides = overridesSnapshot(compPlan, cgSlider);
  const isDirty = currentOverrides !== baselineOverrides;

  // A driver holding only a truck or only a trailer has no tare or compartments, so the
  // plan is replaced by a prompt to pick the missing unit and cannot load.
  const isPartialEquipment = equipment.isBobtail || equipment.isTrailerOnly;

  // ── Render ─────────────────────────────────────────────────────────────────
  // Landscape trims the page padding and raises the max width (1100 elsewhere).
  const pageStyle = isLandscape
    ? { ...styles.page, padding: 6, maxWidth: 1800 }
    : styles.page;
  // Shown in Plan Review once loading begins (not while planning).
  const supplierPanelEl = (
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

  // What the flows read with usePlanner(). Built here from the model hooks above.
  const plannerCtx: PlannerCtx = {
    shell, effectiveUserId, loadWorkflow, setCompPlan, effectivePlanRows, capOverridesForReview,
    persistedCapForComp, livePreviewGrossLbs, livePreviewDiffLbs, targetWeight, unavailableComps,
    productNameById, productHexCodeById, productInputsForModal, tuneRows, onTuneProduct, tuneTempColor,
    fuelTempAmbientF, terminalLabel, selectedRackName, fuelTankGallons, saveFuelTankGallons, recentFuelPct,
    tripModeForLoading, recordTripLoaded, loadGeoShips, reportFromDashboard,
    handleTapTerminalInLoadingModal, handleBackToPlannerNoUpdate,
    openCancelLoadSheet: () => setCancelLoadConfirmOpen(true),
    terminalSwitchConfirm, handleUpdateCardAtPrevious, handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal, switchReportedIssueRef, switchReasonNoteRef,
    tripPickup, tripWaitingPickup,
    cancelLoadConfirmOpen, setCancelLoadConfirmOpen, handleSubmitOutageReport,
    staleApiPrompt, setStaleApiPrompt, handleStaleSafest, handleStaleSafe, handleStaleIgnore,
    altEquipmentPrompt, setAltEquipmentPrompt, handleViewAltLoadInReports,
    tempDialOpen, setTempDialOpen, tempReconfirmProductIds, setTempReconfirmProductIds,
    handleConfirmTempReconfirm, handleConfirmTempAndBeginLoad,
    fuelTempLoading, fuelTempConfidence, predictedFuelTempF, tempF, setTempF, setSingleProductTempF,
    tempModalProductGroups,
    planSlots, activeSlotLetter, presetQuickPickOpen, setPresetQuickPickOpen,
    summaryForSlot, nameForSlot, colorsForSlot, handlePresetLoad, handlePresetSaveEmpty,
    setPresetSheetSlot, handleRecallLastLoad, presetSheetSlot, presetSheetSummary,
    handlePresetSheetLoad, handlePresetSheetEdit, handlePresetSheetClear, closePresetSheet,
    active, compModalOpen, compModalComp, compartments, compPlan, terminalProducts, closeCompModal,
    fetchTerminalProducts,
    wizardOpen, wizardNew, setWizardNew, planCatalogProducts, canSetCap, handleWizardSaveCaps, handleWizardFinish,
    supplierPanel: supplierPanelEl,
  };

  return (
    <PlannerProvider value={plannerCtx}>
    <>
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
            } else setWizardNew(true);
          }}
          closing={!!leaving}
          onClose={() => leaveTo("/planner/home", "Opening dashboard…")}
        />
      )}

      <PlannerGates
        onboardingActive={onboardingActive}
        active={active}
        terminalLabel={terminalLabel ?? ""}
        onOnboardingComplete={() => setOnboardingDone(true)}
      />
    </div>
    {/* Windows sit outside the page div so they still show while the plan page is hidden. */}
    <PlanReviewFlow />
    <PlanSlotsFlow />
    <CompartmentFlow />
    <PlanBuilderFlow />
    <TerminalSwitchFlow />
    <ReportIssueFlow />
    <StaleApiFlow />
    <RecallEquipmentFlow />
    <TempConfirmFlow />
    </>
    </PlannerProvider>
  );
}
