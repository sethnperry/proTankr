"use client";
// app/planner/model/usePlanModel.ts
//
// Planner model layer (plan). Plan: the live plan, its inputs, saved plans, density and weight math.
// Built from hooks; no JSX. Part of the Planner composition: see docs/planner-architecture.md.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlanSlots } from "../hooks/usePlanSlots";
import { usePlanMath } from "../hooks/usePlanMath";
import { useUnavailableProducts } from "../hooks/useUnavailableProducts";
import { usePlanTemperature } from "../hooks/usePlanTemperature";
import { usePlanInputs } from "../hooks/usePlanInputs";
import { usePlanDirty } from "../hooks/usePlanDirty";
import { usePlannerEquipment } from "../hooks/usePlannerEquipment";
import { useTerminalProducts } from "../hooks/useTerminalProducts";
import { usePlannerWindowState } from "../hooks/usePlannerWindowState";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import type { CompPlanInput, ProductRow } from "../types";

import type { usePlannerView } from "./usePlannerView";
type UsePlannerViewModel = ReturnType<typeof usePlannerView>;

export function usePlanModel(v: UsePlannerViewModel) {
  const { shell, effectiveUserId, equipment, location, active } = v;
  const {
    compModalOpen,
    setCompModalOpen,
    compModalComp,
    setCompModalComp,
    tempDialOpen,
    setTempDialOpen,
    cancelLoadConfirmOpen,
    setCancelLoadConfirmOpen,
    apiSafetyOverride,
    setApiSafetyOverride,
    tunedApiTempByProduct,
    setTunedApiTempByProduct,
    staleApiPrompt,
    setStaleApiPrompt,
    beginAfterOverride,
    setBeginAfterOverride,
    activeSlotLetter,
    setActiveSlotLetter,
    selectedComp,
    setSelectedComp,
    planRestoreAttempted,
    setPlanRestoreAttempted,
    altEquipmentPrompt,
    setAltEquipmentPrompt,
    preLoadCardedOnRef,
    handlePlanRestored,
    handleRestoreAttempted
  } = usePlannerWindowState();

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

  return {
    compModalOpen,
    setCompModalOpen,
    compModalComp,
    setCompModalComp,
    tempDialOpen,
    setTempDialOpen,
    cancelLoadConfirmOpen,
    setCancelLoadConfirmOpen,
    setApiSafetyOverride,
    tunedApiTempByProduct,
    setTunedApiTempByProduct,
    staleApiPrompt,
    setStaleApiPrompt,
    beginAfterOverride,
    setBeginAfterOverride,
    activeSlotLetter,
    setActiveSlotLetter,
    selectedComp,
    setSelectedComp,
    planRestoreAttempted,
    altEquipmentPrompt,
    setAltEquipmentPrompt,
    preLoadCardedOnRef,
    compartments,
    setCompartments,
    compLoading,
    compError,
    selectedTrailerId,
    equipmentDetails,
    selectedTruckId,
    fuelTankGallons,
    saveFuelTankGallons,
    fetchTerminalProducts,
    selectedRackName,
    planCatalogProducts,
    terminalProducts,
    tempF,
    setTempF,
    tempFRef,
    productTempF,
    setProductTempF,
    setSingleProductTempF,
    cgSlider,
    setCgSlider,
    compPlan,
    setCompPlan,
    overridesSnapshot,
    baselineOverrides,
    setBaselineOverrides,
    setCaptureBaselineNext,
    productInputs,
    setProductInputs,
    setProductApi,
    setProductTemp,
    predictedFuelTempF,
    fuelTempConfidence,
    fuelTempLoading,
    fuelTempAmbientF,
    fuelTempUnbiasedF,
    refreshFuelTemp,
    userAdjustedTempRef,
    apiBasisForProduct,
    capOverridesForReview,
    capacityResult,
    cgBias,
    effectiveMaxGallonsForComp,
    effectivePlanRows,
    effectivePlannedGallonsTotal,
    effectivePlannedWeightLbs,
    lbsPerGalForProductId,
    livePreviewDiffLbs,
    livePreviewGrossLbs,
    persistedCapForComp,
    planRows,
    planUsesReferenceApi,
    plannedGallonsByComp,
    plannedProductIds,
    setLoadingGallonsOverride,
    tare,
    targetWeight,
    tripStoreHook,
    unstableLoad,
    planSlots,
    productNameById,
    setCheckAvailabilityNext,
    unavailableComps,
  };
}
