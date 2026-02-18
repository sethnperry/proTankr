"use client";
// hooks/useLoadWorkflow.ts
// Owns: begin_load, complete_load RPCs, load state machine, load report.

import { useCallback, useState } from "react";
import { beginLoad, completeLoad } from "@/lib/supabase/load";
import { lbsPerGallonAtTemp } from "../utils/planMath";
import type { LoadReport, PlanRow, ProductRow } from "../types";

// ─── Hook ─────────────────────────────────────────────────────────────────────

type Props = {
  selectedComboId: string;
  selectedTerminalId: string;
  selectedState: string;
  selectedCity: string;
  selectedCityId: string | null;
  tare: number;
  buffer: number;
  cgBias: number;
  ambientTempF: number | null;
  tempF: number;
  planRows: PlanRow[];
  plannedGallonsTotal: number;
  plannedWeightLbs: number;
  terminalProducts: ProductRow[];
  productNameById: Map<string, string>;
  productInputs: Record<string, { api?: string; tempF?: number }>;
  setProductInputs: (v: Record<string, { api?: string; tempF?: number }>) => void;
};

export function useLoadWorkflow({
  selectedComboId, selectedTerminalId, selectedState, selectedCity, selectedCityId,
  tare, buffer, cgBias, ambientTempF, tempF,
  planRows, plannedGallonsTotal, plannedWeightLbs,
  terminalProducts, productNameById,
  productInputs, setProductInputs,
}: Props) {
  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [beginLoadBusy, setBeginLoadBusy] = useState(false);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingModalError, setLoadingModalError] = useState<string | null>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [actualByComp, setActualByComp] = useState<
    Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }>
  >({});

  const [loadReport, setLoadReport] = useState<LoadReport | null>(null);

  const PLAN_SNAPSHOT_VERSION = 1;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function alphaPerFForProductId(productId: string): number | null {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.alpha_per_f == null) return null;
    const v = Number(p.alpha_per_f);
    return Number.isFinite(v) ? v : null;
  }

  function computePlannedGrossLbs(): number | null {
    if (![tare, buffer, plannedWeightLbs].every((x) => Number.isFinite(x))) return null;
    return tare + buffer + plannedWeightLbs;
  }

  // ── Begin load ────────────────────────────────────────────────────────────

  const beginLoadToSupabase = useCallback(async () => {
    if (beginLoadBusy) return;
    try {
      setBeginLoadBusy(true);
      if (!selectedComboId) throw new Error("Select equipment first.");
      if (!selectedTerminalId) throw new Error("Select terminal first.");
      if (!selectedState || !selectedCity) throw new Error("Select location first.");
      if (!selectedCityId) throw new Error("City ID not found.");
      if (!planRows || planRows.length === 0) throw new Error("No plan to load.");

      const lines = (planRows as any[])
        .filter((r) => r.productId && Number(r.planned_gallons ?? 0) > 0)
        .map((r) => {
          const gallons = Number(r.planned_gallons ?? 0);
          const lbs = gallons * Number(r.lbsPerGal ?? 0);
          return {
            comp_number: Number(r.comp_number),
            product_id: String(r.productId),
            planned_gallons: Number.isFinite(gallons) ? gallons : null,
            planned_lbs: Number.isFinite(lbs) ? lbs : null,
            temp_f: tempF ?? null,
          };
        });

      if (lines.length === 0) throw new Error("No filled compartments.");

      const planned_total_gal = Number.isFinite(plannedGallonsTotal) ? plannedGallonsTotal : null;
      const planned_total_lbs = Number.isFinite(plannedWeightLbs) ? plannedWeightLbs : null;
      const planned_gross_lbs =
        Number.isFinite(tare) && Number.isFinite(buffer) && Number.isFinite(plannedWeightLbs)
          ? tare + buffer + plannedWeightLbs : null;

      const result = await beginLoad({
        combo_id: selectedComboId,
        terminal_id: selectedTerminalId,
        state_code: selectedState,
        city_id: selectedCityId,
        cg_bias: Number.isFinite(cgBias) ? cgBias : null,
        ambient_temp_f: ambientTempF ?? null,
        product_temp_f: tempF ?? null,
        planned_totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
        planned_snapshot: {
          v: PLAN_SNAPSHOT_VERSION,
          created_at: new Date().toISOString(),
          totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
          lines,
        },
        lines,
      });

      setActiveLoadId(result.load_id);

      // Init per-product inputs
      const nextInputs: Record<string, { api?: string; tempF?: number }> = {};
      for (const r of planRows as any[]) {
        const pid = r?.productId ? String(r.productId) : null;
        if (!pid || !Number.isFinite(Number(r?.planned_gallons ?? 0))) continue;
        if (!nextInputs[pid]) nextInputs[pid] = { api: "", tempF: Number(tempF) };
      }
      setProductInputs(nextInputs);
      setLoadingOpen(true);
      setLoadingModalError(null);
    } catch (err: any) {
      console.error(err);
      alert(err?.message ?? "Failed to begin load.");
    } finally {
      setBeginLoadBusy(false);
    }
  }, [
    beginLoadBusy, selectedComboId, selectedTerminalId, selectedState, selectedCity,
    selectedCityId, planRows, plannedGallonsTotal, plannedWeightLbs,
    tare, buffer, cgBias, ambientTempF, tempF, setProductInputs,
  ]);

  // ── On loaded (from loading modal) ────────────────────────────────────────

  const onLoadedFromLoadingModal = useCallback(async () => {
    if (!activeLoadId) return;

    const requiredProductIds = Array.from(new Set(
      (planRows as any[])
        .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
        .map((r) => String(r.productId))
    ));

    for (const pid of requiredProductIds) {
      const apiStr = String(productInputs[pid]?.api ?? "").trim();
      const tempVal = productInputs[pid]?.tempF;
      if (!apiStr || !Number.isFinite(Number(apiStr))) {
        alert(`Enter API for ${productNameById.get(pid) ?? pid}`); return;
      }
      if (tempVal == null || !Number.isFinite(Number(tempVal))) {
        alert(`Enter Temp for ${productNameById.get(pid) ?? pid}`); return;
      }
    }

    const nextActualByComp: Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }> = {};
    let actualPayloadLbs = 0;

    for (const r of planRows as any[]) {
      const comp = Number(r?.comp_number ?? 0);
      const gallons = Number(r?.planned_gallons ?? 0);
      const pid = r?.productId ? String(r.productId) : null;
      if (!Number.isFinite(comp) || comp <= 0 || !pid || !Number.isFinite(gallons) || gallons <= 0) continue;

      const apiNum = Number(String(productInputs[pid]?.api ?? "").trim());
      const tempVal = Number(productInputs[pid]?.tempF);
      const alpha = alphaPerFForProductId(pid);

      if (!Number.isFinite(apiNum) || !Number.isFinite(tempVal) || alpha == null) {
        const lpgPlanned = Number(r?.lbsPerGal ?? 0);
        const lbsPlanned = gallons * (Number.isFinite(lpgPlanned) ? lpgPlanned : 0);
        nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbsPlanned) ? lbsPlanned : null, temp_f: tempVal };
        actualPayloadLbs += Number.isFinite(lbsPlanned) ? lbsPlanned : 0;
        continue;
      }

      const lpg = lbsPerGallonAtTemp(apiNum, alpha, tempVal);
      const lbs = gallons * lpg;
      nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbs) ? lbs : null, temp_f: tempVal };
      if (Number.isFinite(lbs)) actualPayloadLbs += lbs;
    }

    setActualByComp(nextActualByComp);

    try {
      setCompleteBusy(true);
      setCompleteError(null);

      const lines = Object.entries(nextActualByComp).map(([compStr, a]) => ({
        comp_number: Number(compStr),
        actual_gallons: a.actual_gallons ?? null,
        actual_lbs: a.actual_lbs ?? null,
        temp_f: a.temp_f ?? null,
      }));

      const product_updates = requiredProductIds.map((pid) => ({
        product_id: pid,
        api: Number(String(productInputs[pid]?.api ?? "").trim()),
        temp_f: (productInputs[pid]?.tempF ?? null) as number | null,
      }));

      const res = await completeLoad({
        load_id: activeLoadId,
        lines,
        completed_at: new Date().toISOString(),
        product_updates,
      });

      const plannedGross = computePlannedGrossLbs();
      const actualGross =
        Number.isFinite(tare) && Number.isFinite(buffer) && Number.isFinite(actualPayloadLbs)
          ? tare + buffer + actualPayloadLbs : null;
      const diff = Number.isFinite(Number(res?.diff_lbs))
        ? Number(res.diff_lbs)
        : plannedGross != null && actualGross != null ? actualGross - plannedGross : null;

      setLoadReport({
        planned_total_gal: Number(plannedGallonsTotal),
        planned_gross_lbs: plannedGross,
        actual_gross_lbs: actualGross,
        diff_lbs: diff,
      });
      setLoadingOpen(false);
    } catch (e: any) {
      console.error("complete_load failed:", e);
      alert(e?.message ?? String(e));
      setCompleteError(e?.message ?? String(e));
    } finally {
      setCompleteBusy(false);
    }
  }, [activeLoadId, planRows, productInputs, productNameById, tare, buffer, plannedGallonsTotal, terminalProducts]);

  return {
    activeLoadId,
    beginLoadBusy,
    loadingOpen, setLoadingOpen,
    loadingModalError,
    completeOpen, setCompleteOpen,
    completeBusy,
    completeError,
    actualByComp,
    loadReport,
    beginLoadToSupabase,
    onLoadedFromLoadingModal,
  };
}
