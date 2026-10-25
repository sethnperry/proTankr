"use client";
// app/planner/hooks/usePlanMath.ts
//
// Everything derived from the plan: density per product, the caps, the weight
// limits, how many gallons fit (the Planner's own solve and the configured-cap
// solve used to measure utilization), the Plan Review overrides and the live
// weight preview. Lifted out of PlannerHost unchanged; it takes the plan's
// inputs and returns the results, and keeps no state of its own beyond the
// Plan Review gallons override.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlanRows } from "./usePlanRows";
import { computeAvailableCapacity, DEFAULT_COMPANY_TARGET_GROSS_LBS, DEFAULT_LEGAL_GROSS_LBS, type CapacityCompartmentInput } from "@/lib/capacity/computeAvailableCapacity";
import { cgSliderToBias, lbsPerGallonAtTemp, planForGallons, CG_NEUTRAL } from "../utils/planMath";
import { resolveApiBasis } from "../utils/apiBasis";
import { useTripStore } from "@/lib/trips/useTripStore";
import type { TripCompartmentLoadRow, TripPickupRow, TripRow } from "@/lib/trips/types";
import { openTripForDriver } from "@/lib/trips/tripLogic";
import { readPlannedComps } from "@/lib/trips/addPickupCheck";
import { productLbsOnBoard } from "@/lib/trips/truckChange";
import type { ActiveComp, CompPlanInput } from "../types";

import type { Dispatch, SetStateAction } from "react";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import type { CompRow, ProductRow } from "../types";

type Inputs = {
  active: boolean;
  apiSafetyOverride: Record<string, number>;
  catalogProducts: ReturnType<typeof useProductsCatalog>["data"];
  cgSlider: number;
  compPlan: Record<number, CompPlanInput>;
  compartments: CompRow[];
  effectiveUserId: string | null | undefined;
  equipment: ReturnType<typeof useCalculatorShell>["equipment"];
  productTempF: Record<string, number>;
  selectedTrailerId: string | null;
  setCompPlan: Dispatch<SetStateAction<Record<number, CompPlanInput>>>;
  setProductTempF: Dispatch<SetStateAction<Record<string, number>>>;
  tempF: number;
  terminalProducts: ProductRow[];
  tunedApiTempByProduct: Record<string, { api: number; tempF: number }>;
};

export function usePlanMath(i: Inputs) {
  const { active, apiSafetyOverride, catalogProducts, cgSlider, compPlan, compartments, effectiveUserId, equipment, productTempF, selectedTrailerId, setCompPlan, setProductTempF, tempF, terminalProducts, tunedApiTempByProduct } = i;
  // ── CG bias ────────────────────────────────────────────────────────────────
  const cgBias = useMemo(() => cgSliderToBias(cgSlider), [cgSlider]);
  const unstableLoad = cgSlider < CG_NEUTRAL;

  // ── Cap helpers ────────────────────────────────────────────────────────────
  // cap_gallons (configured in Binder's Compartments section) is the real
  // ceiling used for load planning -- max_gallons is informational only.
  // compPlan[n].capOverride is a temporary, per-load reduction on top of
  // that cap (never above it), set by dragging a compartment's handle in
  // the planner; clearing it restores the full configured cap.
  const persistedCapForComp = useCallback((compNumber: number) => {
    const c = compartments.find((x) => Number(x.comp_number) === compNumber);
    if (!c) return 0;
    const cap = c.cap_gallons != null ? Number(c.cap_gallons) : Number(c.max_gallons ?? 0);
    return Number.isFinite(cap) ? Math.max(0, cap) : 0;
  }, [compartments]);

  const effectiveMaxGallonsForComp = useCallback((compNumber: number, persistedCap: number) => {
    const override = compPlan[compNumber]?.capOverride;
    if (override == null) return Math.max(0, Math.floor(persistedCap));
    return Math.max(0, Math.floor(Math.min(Number(override), persistedCap)));
  }, [compPlan]);

  // Compartments the driver has capped below their configured safety cap
  // (comp -> cap gallons), for Plan Review's CAPPED tag.
  const capOverridesForReview = useMemo(() => {
    const out: Record<number, number> = {};
    for (const c of compartments) {
      const n = Number(c.comp_number);
      const override = compPlan[n]?.capOverride;
      if (override == null || !Number.isFinite(Number(override))) continue;
      const persisted = persistedCapForComp(n);
      if (Number(override) < persisted) out[n] = Math.floor(Number(override));
    }
    return out;
  }, [compartments, compPlan, persistedCapForComp]);

  // ── lbs/gal helper ────────────────────────────────────────────────────────
  // True if any planned compartment is using the fallback reference API (no driver-observed last_api)
  const planUsesReferenceApi = useMemo(() => {
    return Object.values(compPlan).some((slot) => {
      if (!slot || slot.empty || !slot.productId) return false;
      const p = terminalProducts.find((p) => p.product_id === slot.productId);
      return p != null && (p.last_api == null || !Number.isFinite(Number(p.last_api)));
    });
  }, [compPlan, terminalProducts]);

  // The one API basis per product (see apiBasis.ts for the rules). Density,
  // the Tune line and the Log the Load prefill all read this, so they can't
  // disagree. Order: the driver's tune, then a stale-API choice made at LOAD
  // (Safest / Safe / Ignore), then the normal rules.
  const apiBasisForProduct = useCallback((productId: string) => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.api_60 == null || p.alpha_per_f == null) return null;
    const basis = resolveApiBasis({
      alphaPerF: Number(p.alpha_per_f),
      api60Ref: Number(p.api_60),
      apiMin: p.api_min != null ? Number(p.api_min) : null,
      minApiObserved: (p as any).min_api_observed != null ? Number((p as any).min_api_observed) : null,
      lastApi: p.last_api != null ? Number(p.last_api) : null,
      lastTempF: p.last_temp_f != null ? Number(p.last_temp_f) : null,
      lastApiUpdatedAt: (p as any).last_api_updated_at ?? null,
      tuned: active ? null : (tunedApiTempByProduct[productId] ?? null),
      nowMs: Date.now(),
    });
    const overrideApi60 = apiSafetyOverride[productId];
    if (!active && basis.tier !== "tuned" && overrideApi60 != null && Number.isFinite(overrideApi60)) {
      return { ...basis, api60: Number(overrideApi60), displayApi: Number(overrideApi60) };
    }
    return basis;
  }, [terminalProducts, apiSafetyOverride, tunedApiTempByProduct, active]);

  const lbsPerGalForProductId = useCallback((productId: string): number | null => {
    const p = terminalProducts.find((x) => x.product_id === productId);
    const basis = apiBasisForProduct(productId);
    if (!p || !basis) return null;
    // A tuned reading is density at the temp it was read at; otherwise at
    // this product's planned temp.
    const tuned = tunedApiTempByProduct[productId];
    const t = active ? 60 : basis.tier === "tuned" && tuned ? Number(tuned.tempF) : (productTempF[productId] ?? tempF);
    return lbsPerGallonAtTemp(basis.api60, Number(p.alpha_per_f), t);
  }, [terminalProducts, tempF, productTempF, apiBasisForProduct, tunedApiTempByProduct, active]);

  // ── Active compartments ────────────────────────────────────────────────────
  const activeComps = useMemo<ActiveComp[]>(() => {
    if (!selectedTrailerId || compartments.length === 0 || terminalProducts.length === 0) return [];
    const out: ActiveComp[] = [];
    for (const c of compartments) {
      const compNumber = Number(c.comp_number);
      const persistedCap = persistedCapForComp(compNumber);
      const maxGallons = effectiveMaxGallonsForComp(compNumber, persistedCap);
      const position = -(Number(c.position ?? 0)); // DB +position = REAR → flip to FRONT
      if (!Number.isFinite(compNumber) || maxGallons <= 0) continue;
      const sel = compPlan[compNumber];
      if (!sel || sel.empty || !sel.productId) continue;
      const lbsPerGal = lbsPerGalForProductId(sel.productId);
      if (lbsPerGal == null || !(lbsPerGal > 0)) continue;
      out.push({ compNumber, maxGallons, position: Number.isFinite(position) ? position : 0, productId: sel.productId, lbsPerGal });
    }
    out.sort((a, b) => a.position - b.position);
    return out;
  }, [selectedTrailerId, compartments, terminalProducts, compPlan, tempF, apiSafetyOverride, lbsPerGalForProductId]);

  // Seed productTempF for any planned product that doesn't have an entry yet
  // (new product just added to the plan), and drop entries for products no
  // longer in the plan. New products seed to the CURRENT dial value (tempF)
  // -- not the raw prediction -- so a product added after the driver has
  // already nudged the dial away from the prediction picks up that nudge
  // too, instead of jumping back to the un-adjusted number.
  const plannedProductIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of activeComps) if (c.productId) s.add(c.productId);
    return s;
  }, [activeComps]);

  useEffect(() => {
    setProductTempF((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const pid of plannedProductIds) {
        if (!(pid in next)) { next[pid] = tempF; changed = true; }
      }
      for (const pid of Object.keys(next)) {
        if (!plannedProductIds.has(pid)) { delete next[pid]; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [plannedProductIds, tempF]);

  // ── Second pickup on a partly loaded trailer ───────────────────────────────
  // Added from the Driver Dashboard ("+ Another pickup") with the empty
  // compartments it fills (trip_pickups.planned_comps). Here the Planner
  // plans only those compartments, and what's already aboard counts as part
  // of the tare, so the plan fills the rest up to the target and the gross
  // includes everything on the trailer.
  const tripStoreHook = useTripStore(effectiveUserId || null);
  const tripPartial = useMemo(() => {
    if (!effectiveUserId) return null;
    const rows = tripStoreHook.state.rows;
    const trip = openTripForDriver(Object.values(rows.trips ?? {}) as TripRow[], effectiveUserId);
    if (!trip) return null;
    const pk = (Object.values(rows.trip_pickups ?? {}) as TripPickupRow[])
      .filter((p) => p.trip_id === trip.trip_id && !p.left_at)
      .sort((a, b) => a.seq - b.seq)[0];
    const planned = pk ? readPlannedComps(pk.planned_comps) : null;
    if (!pk || !planned) return null;
    const aboard = (Object.values(rows.trip_compartment_loads ?? {}) as TripCompartmentLoadRow[])
      .filter((c) => c.trip_id === trip.trip_id && c.pickup_id !== pk.pickup_id && c.disposition === "loaded");
    return { pickup: pk, planned, aboard };
  }, [effectiveUserId, tripStoreHook.state]);
  const onBoardLbs = useMemo(() => {
    if (!tripPartial) return 0;
    const alpha = (id: string | null) => {
      const p = id ? catalogProducts.find((x) => x.product_id === id) : null;
      return p?.alpha_per_f != null ? Number(p.alpha_per_f) : null;
    };
    return Math.round(productLbsOnBoard(tripPartial.aboard, alpha).lbs);
  }, [tripPartial, catalogProducts]);

  // Keep the plan to the picked compartments: those get a product (the one
  // picked on the dashboard unless the driver changes it), every other
  // compartment stays empty. Caps are left alone.
  useEffect(() => {
    if (!tripPartial || compartments.length === 0) return;
    const want = new Map(tripPartial.planned.map((p) => [p.comp_number, p.product_id]));
    setCompPlan((prev: Record<number, CompPlanInput>) => {
      let changed = false;
      const next: Record<number, CompPlanInput> = { ...prev };
      for (const c of compartments) {
        const n = Number(c.comp_number);
        if (!Number.isFinite(n)) continue;
        const cur = prev[n] ?? { empty: true, productId: "" };
        const pid = want.get(n);
        if (pid) {
          if (cur.empty || !cur.productId) { next[n] = { ...cur, empty: false, productId: pid }; changed = true; }
        } else if (!cur.empty || cur.productId) {
          next[n] = { ...cur, empty: true, productId: "" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tripPartial, compPlan, compartments]);

  // ── Weight limits ──────────────────────────────────────────────────────────
  // target_weight = the gross weight the driver is trying to hit (renamed from gross_limit_lbs)
  const targetWeight = Number((equipment.selectedCombo as any)?.target_weight ?? 0);
  // On a second pickup, product already aboard rides as tare.
  const tare = Number(equipment.selectedCombo?.tare_lbs ?? 0) + onBoardLbs;
  const allowedLbs = Math.max(0, targetWeight - tare);  // payload = target - tare

  const capacityGallonsActive = useMemo(
    () => activeComps.reduce((s, c) => s + Number(c.maxGallons || 0), 0),
    [activeComps]
  );

  // ── Plan rows (binary search) ──────────────────────────────────────────────
  const plannedResult = usePlanRows({ selectedTrailerId, activeComps, allowedLbs, cgBias, capacityGallonsActive, planForGallons });

  // ── Available capacity (payload utilization, Phase 1) ─────────────────────
  // A SECOND solve of the same plan, and the one real difference is the
  // ceiling it uses: activeComps above is built from
  // effectiveMaxGallonsForComp (the driver's own capOverride handle drag),
  // while this is built from persistedCapForComp (the admin-gated configured
  // cap). That substitution is the whole anti-gaming rule -- a driver
  // reducing their own ceiling is exactly what the metric exists to catch, so
  // it must not be able to shrink the denominator too. Everything else -- CG
  // bias, per-product density at the confirmed temp, positions, the weight
  // ceiling -- is identical, and both go through the same solveMaxGallons.
  //
  // Deliberately NOT read from incentive_settings: its target_gross_lbs
  // column doesn't exist until this pass's migration is applied, and adding
  // it to that fetch's select early would 400 the whole query and break the
  // existing incentive card (the same class of failure as the buffer_lbs
  // incident). The combo's own target_weight is the ceiling the Planner
  // already plans against anyway, so it is the honest number to measure
  // against; record_load_utilization resolves the same value server-side.
  const capacityCompartments = useMemo<CapacityCompartmentInput[]>(() => {
    if (!selectedTrailerId) return [];
    const out: CapacityCompartmentInput[] = [];
    for (const c of compartments) {
      const n = Number(c.comp_number);
      if (!Number.isFinite(n)) continue;
      const sel = compPlan[n];
      if (!sel || sel.empty || !sel.productId) continue;

      const persistedCap = persistedCapForComp(n);
      if (!(persistedCap > 0)) continue;

      const p = terminalProducts.find((x) => x.product_id === sel.productId);
      if (!p || p.api_60 == null || p.alpha_per_f == null) continue;

      out.push({
        comp_number: n,
        position: -(Number(c.position ?? 0)), // DB +position = REAR -> flip to FRONT
        cap_gallons: persistedCap,
        cap_override_gallons: sel.capOverride ?? null, // recorded, never used in the math
        product_id: sel.productId,
        api_60: Number(p.api_60),
        alpha_per_f: Number(p.alpha_per_f),
        observed_api: p.last_api != null ? Number(p.last_api) : null,
        observed_api_temp_f: p.last_temp_f != null ? Number(p.last_temp_f) : null,
        temp_f: productTempF[sel.productId] ?? tempF,
      });
    }
    return out;
  }, [selectedTrailerId, compartments, compPlan, terminalProducts, persistedCapForComp, productTempF, tempF]);

  const capacityResult = useMemo(
    () => computeAvailableCapacity({
      tare_lbs: tare,
      target_gross_lbs: targetWeight > 0 ? targetWeight : DEFAULT_COMPANY_TARGET_GROSS_LBS,
      legal_gross_lbs: DEFAULT_LEGAL_GROSS_LBS,
      cg_bias: cgBias,
      compartments: capacityCompartments,
    }),
    [tare, targetWeight, cgBias, capacityCompartments],
  );
  const planRows = plannedResult.planRows;

  const plannedGallonsByComp = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const r of planRows as any[]) {
      const n = Number(r.comp_number ?? r.compNumber ?? 0);
      if (Number.isFinite(n)) m[n] = Number(r.planned_gallons ?? r.plannedGallons ?? 0);
    }
    return m;
  }, [planRows]);

  // ── Loading modal: Plan Review gallons override ─────────────────────────────
  // Isolated per-compartment override, applied AFTER planRows is already
  // computed -- deliberately NOT compPlan.capOverride, which feeds INTO
  // usePlanRows'/planForGallons's binary-search allocation and can cause
  // OTHER compartments to gain gallons to compensate (confirmed by reading
  // usePlanRows.ts -- it always maximizes total gallons under the weight
  // budget). Editing one compartment here changes only that compartment;
  // every other row is mathematically guaranteed untouched, even if that
  // leaves legal weight capacity unused (explicit product decision -- e.g.
  // reacting to a stale API by intentionally loading light on just that
  // compartment, not redistributing the "missing" gallons elsewhere).
  // Reset to {} on every fresh LOAD tap (see beginLoadToSupabase); never
  // persisted to compPlan or presets -- more ephemeral than capOverride
  // even (which is itself already excluded from saved presets).
  const [loadingGallonsOverride, setLoadingGallonsOverride] = useState<Record<number, number>>({});

  const effectivePlanRows = useMemo(() => {
    if (Object.keys(loadingGallonsOverride).length === 0) return planRows;
    return planRows.map((r) =>
      loadingGallonsOverride[r.comp_number] != null
        ? { ...r, planned_gallons: loadingGallonsOverride[r.comp_number] }
        : r
    );
  }, [planRows, loadingGallonsOverride]);

  const effectivePlannedWeightLbs = useMemo(
    () => effectivePlanRows.reduce((sum, r: any) => sum + Number(r.planned_gallons ?? 0) * Number(r.lbsPerGal ?? 0), 0),
    [effectivePlanRows]
  );
  const effectivePlannedGallonsTotal = effectivePlanRows.reduce((s, r) => s + r.planned_gallons, 0);

  // Live weight/diff shown in the Loading modal's Plan Review phase. This is
  // the PLAN's own solved weight (effectivePlannedWeightLbs = Σ gallons ×
  // each comp's solved lbsPerGal), which solveMaxGallons already caps at
  // allowedLbs (= target − tare), so a fresh plan's live weight can never
  // exceed target -- exactly the safety guarantee the driver expects.
  //
  // It deliberately does NOT recompute from productInputs here: API/temp are
  // now entered at Log the Load (a later step), so in Plan Review those are
  // just prefilled defaults. Recomputing with them re-derived density on a
  // different back-correction basis than the solve used (observed temp vs.
  // current temp), which made the preview drift HEAVIER than the plan and
  // read as "over target" on a plan that was actually under it. Using the
  // solved weight keeps the preview and the plan identical.
  const livePreviewGrossLbs = Number.isFinite(tare) ? tare + effectivePlannedWeightLbs : null;
  const livePreviewDiffLbs = livePreviewGrossLbs != null && targetWeight > 0 ? livePreviewGrossLbs - targetWeight : null;

  return { apiBasisForProduct, capOverridesForReview, capacityResult, cgBias, effectiveMaxGallonsForComp, effectivePlanRows, effectivePlannedGallonsTotal, effectivePlannedWeightLbs, lbsPerGalForProductId, livePreviewDiffLbs, livePreviewGrossLbs, persistedCapForComp, planRows, planUsesReferenceApi, plannedGallonsByComp, plannedProductIds, setLoadingGallonsOverride, tare, targetWeight, tripStoreHook, unstableLoad };
}
