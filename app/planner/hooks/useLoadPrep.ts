"use client";
// app/planner/hooks/useLoadPrep.ts
//
// What happens between the plan and Begin Loading: the Tune panel's rows and its
// edits, the stale-API choice (Safest / Safe / Ignore), the product temperature
// confirm, and whether the load can start. Lifted out of PlannerHost unchanged.

import { useCallback, useMemo } from "react";
import { backCorrectApiTo60 } from "../utils/planMath";
import { buildTuneRows } from "../utils/tuneRows";
import { isStaleReading, pickSafest, pickSafe, pickIgnore } from "../utils/staleApi";
import { DEFAULT_STALE_API_DAYS } from "@/lib/config/plannerSafety";
import type { Dispatch, SetStateAction } from "react";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useFuelTempPrediction } from "./useFuelTempPrediction";
import type { useLoadWorkflow } from "./useLoadWorkflow";
import type { usePlanMath } from "./usePlanMath";
import type { StaleProduct } from "../components/StaleApiOverlay";
import type { ProductRow } from "../types";

type Math = ReturnType<typeof usePlanMath>;

type Inputs = {
  apiBasisForProduct: Math["apiBasisForProduct"];
  equipment: ReturnType<typeof useCalculatorShell>["equipment"];
  fuelTempConfidence: ReturnType<typeof useFuelTempPrediction>["confidence"];
  lastProductInfoById: Record<string, { last_api: number | null; last_api_updated_at: string | null }>;
  lbsPerGalForProductId: Math["lbsPerGalForProductId"];
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  location: ReturnType<typeof useCalculatorShell>["location"];
  planRows: Math["planRows"];
  plannedProductIds: Math["plannedProductIds"];
  productCodeById: Record<string, string>;
  productHexCodeById: Record<string, string>;
  productInputs: Record<string, { api?: string; tempF?: number }>;
  productNameById: Map<string, string>;
  productTempF: Record<string, number>;
  requestBegin: (override: Record<string, number>) => void;
  setProductApi: (productId: string, api: string) => void;
  setProductTemp: (productId: string, tempF: number) => void;
  setSingleProductTempF: (productId: string, tempF: number) => void;
  setStaleApiPrompt: Dispatch<SetStateAction<{ products: StaleProduct[] } | null>>;
  setTempDialOpen: Dispatch<SetStateAction<boolean>>;
  setTunedApiTempByProduct: Dispatch<SetStateAction<Record<string, { api: number; tempF: number }>>>;
  staleApiPrompt: { products: StaleProduct[] } | null;
  tempF: number;
  terminalProducts: ProductRow[];
  tunedApiTempByProduct: Record<string, { api: number; tempF: number }>;
};

export function useLoadPrep(i: Inputs) {
  const { apiBasisForProduct, equipment, fuelTempConfidence, lastProductInfoById, lbsPerGalForProductId, loadWorkflow, location, planRows, plannedProductIds, productCodeById, productHexCodeById, productInputs, productNameById, productTempF, requestBegin, setProductApi, setProductTemp, setSingleProductTempF, setStaleApiPrompt, setTempDialOpen, setTunedApiTempByProduct, staleApiPrompt, tempF, terminalProducts, tunedApiTempByProduct } = i;
  // Confidence -> temp color (same palette as the temp prediction, so the Tune
  // panel's temp keeps the confidence color the driver already knows).
  const tuneTempColor = useMemo(() => {
    const c = fuelTempConfidence;
    if (c === "high") return "#4ade80";
    if (c === "medium") return "#fbbf24";
    if (c === "low") return "#f87171";
    return "#ffffff";
  }, [fuelTempConfidence]);

  // Per-product rows for Plan Review's Tune panel: code · temp · API · lbs/gal
  // · date. Minimal by design. The density (lbsPerGal) already reflects any
  // tune (lbsPerGalForProductId reads tunedApiTempByProduct), so the panel and
  // the planned gallons can never disagree.
  const tuneRows = useMemo(() => buildTuneRows({
    productIds: plannedProductIds,
    tuned: tunedApiTempByProduct,
    productTempF,
    tempF,
    lastApiByProduct: Object.fromEntries(terminalProducts.map((p) => [p.product_id, p.last_api])),
    lastInfoById: lastProductInfoById,
    lbsPerGal: lbsPerGalForProductId,
    basis: apiBasisForProduct,
    codeById: productCodeById,
    nameById: productNameById,
    hexById: productHexCodeById,
  }), [plannedProductIds, tunedApiTempByProduct, terminalProducts, lastProductInfoById, productTempF, tempF, lbsPerGalForProductId, apiBasisForProduct, productCodeById, productNameById, productHexCodeById]);

  // Apply a Tune-panel edit: drives the planning density (tunedApiTempByProduct
  // + productTempF) AND the submission inputs (productInputs) so the logged
  // weight matches what the driver tuned. Gallons recompute live off the
  // density change.
  const onTuneProduct = useCallback((productId: string, api: number, tempFVal: number) => {
    setTunedApiTempByProduct((prev) => ({ ...prev, [productId]: { api, tempF: tempFVal } }));
    setSingleProductTempF(productId, tempFVal);
    setProductApi(productId, String(api));
    setProductTemp(productId, tempFVal);
  }, [setSingleProductTempF, setProductApi, setProductTemp]);

  // ── Stale-API decision helpers ────────────────────────────────────────────
  // (Placed here, after lastProductInfoById + productHexCodeById, which they
  // read; requestBegin + the begin/clear effects live up near the other load
  // handlers since they don't depend on these.)
  // Sourced from lib/config/plannerSafety.ts so it can move to a super-admin
  // dashboard control later without hunting for a hardcoded 7 (see #2).
  const STALE_API_DAYS = DEFAULT_STALE_API_DAYS;
  const computeStalePlannedProducts = useCallback((): StaleProduct[] => {
    const now = Date.now();
    return Array.from(plannedProductIds)
      .filter((pid) => isStaleReading(lastProductInfoById[pid], STALE_API_DAYS, now))
      .map((pid) => ({
        productId: pid,
        name: productNameById.get(pid) ?? pid,
        dotColor: (productHexCodeById[pid] && productHexCodeById[pid].trim()) || "rgba(255,255,255,0.5)",
      }));
  }, [plannedProductIds, lastProductInfoById, productNameById, productHexCodeById]);

  // What Log the Load starts each product's API box at: whatever the driver
  // entered/tuned, else the same number the plan stands on. Blank on a first
  // load at a terminal (no history) so the first reading saved is a real BOL
  // number -- prefilling product min there let a tap-through record product
  // min as if the terminal had measured it (2026-09-28/29).
  const productInputsForModal = useMemo(() => {
    const out: Record<string, { api?: string; tempF?: number }> = { ...productInputs };
    for (const pid of plannedProductIds) {
      const cur = out[pid];
      if (cur?.api) continue;
      const b = apiBasisForProduct(pid);
      const api = b && b.hasHistory ? String(Math.round(b.displayApi * 100) / 100) : "";
      out[pid] = { ...(cur ?? {}), api };
    }
    return out;
  }, [productInputs, plannedProductIds, apiBasisForProduct]);

  // Build the per-product API_60 override for a stale-API choice. `pick`
  // returns the chosen API for one product, or null to leave it on its
  // normal density (fresh products are never in the stale list anyway).
  const buildStaleOverride = useCallback((pick: (p: ProductRow) => number | null): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const sp of staleApiPrompt?.products ?? []) {
      const prod = terminalProducts.find((p) => p.product_id === sp.productId);
      if (!prod) continue;
      const v = pick(prod);
      if (v != null && Number.isFinite(v)) map[sp.productId] = Number(v);
    }
    return map;
  }, [staleApiPrompt, terminalProducts]);

  const handleStaleSafest = useCallback(() => {
    const map = buildStaleOverride(pickSafest);
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  const handleStaleSafe = useCallback(() => {
    const map = buildStaleOverride(pickSafe);
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  const handleStaleIgnore = useCallback(() => {
    const map = buildStaleOverride((p) => pickIgnore(p, backCorrectApiTo60));
    setStaleApiPrompt(null);
    requestBegin(map);
  }, [buildStaleOverride, requestBegin]);

  // ProductTempModal's "Confirm & Continue" for the LOAD flow (step 2, after
  // the driver confirms/adjusts temp). Closes the temp modal, then runs the
  // stale-API check: if anything's stale, open the Good/Better/Best overlay;
  // otherwise begin directly. requestBegin's effect captures
  // preLoadCardedOnRef and starts begin_load. (The temp modal's own header
  // Close is the bail-out -- nothing has begun yet, nothing to undo.)
  const handleConfirmTempAndBeginLoad = useCallback(() => {
    setTempDialOpen(false);
    const stale = computeStalePlannedProducts();
    if (stale.length > 0) {
      setStaleApiPrompt({ products: stale });
    } else {
      requestBegin({});
    }
  }, [computeStalePlannedProducts, requestBegin]);

  // Per-product rows for the Temp modal's product list (dot + name + own
  // temp, tap to adjust just that one) -- same shape as LoadingModal's own
  // planned-compartments/product-groups rows, for visual continuity.
  const tempModalProductGroups = useMemo(() => {
    return Array.from(plannedProductIds)
      .map((pid) => ({
        productId: pid,
        name: productNameById.get(pid) ?? pid,
        hex: (productHexCodeById[pid] && productHexCodeById[pid].trim()) || "rgba(255,255,255,0.5)",
        tempF: productTempF[pid] ?? tempF,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plannedProductIds, productNameById, productHexCodeById, productTempF, tempF]);


  // ── Derived load state ─────────────────────────────────────────────────────
  // unavailableComps is deliberately NOT folded into loadDisabled -- per
  // spec, tapping LOAD while it's non-empty should produce an explicit
  // "Cannot Load" message (see loadBlockedMsg below), not just a silently
  // inert button, so a driver who ignores the compartment-bar warning still
  // gets told exactly why.
  const loadDisabled =
    loadWorkflow.beginLoadBusy ||
    !equipment.selectedComboId ||
    !location.selectedTerminalId ||
    !location.selectedState ||
    !location.selectedCity ||
    !location.selectedCityId ||
    planRows.length === 0;

  // "RELOAD" used to mean "the plan I'm about to submit is the same one
  // already on file as the last load," tracked via recapValid -- removed
  // along with that mechanism (see the recap card's own comment for why:
  // recapValid didn't actually verify the live plan matched the last real
  // load, it just trivially matched itself). Always "LOAD" now.
  // On a trip, the tap is the moment loading begins (it becomes the
  // pickup's begin time), so the button says so.

  return { handleConfirmTempAndBeginLoad, handleStaleIgnore, handleStaleSafe, handleStaleSafest, loadDisabled, onTuneProduct, productInputsForModal, tempModalProductGroups, tuneRows, tuneTempColor };
}
