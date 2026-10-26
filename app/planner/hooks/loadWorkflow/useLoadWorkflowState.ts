"use client";
// app/planner/hooks/loadWorkflow/useLoadWorkflowState.ts
//
// Props plus the load state: active load, busy flags, report state, helpers.

import { useState } from "react";
import { type LoadUtilizationResult } from "../../utils/loadSideEffects";
import type { LoadReport } from "../../types";

import type { Props, ReportLine } from "./types";

export function useLoadWorkflowState(props: Props) {
  const {
    authUserId,
    selectedComboId,
    selectedTerminalId,
    selectedRackId,
    selectedState,
    selectedCity,
    selectedCityId,
    tare,
    cgBias,
    ambientTempF,
    tempF,
    planRows,
    plannedGallonsTotal,
    plannedWeightLbs,
    terminalProducts,
    productNameById,
    setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalProducts,
    onRefreshTerminalAccess,
    onPostLoadComplete,
    predictedTempF,
    unbiasedPredictedTempF,
    activeSlotLetter,
    capacityResult,
  } = props;

  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [beginLoadBusy, setBeginLoadBusy] = useState(false);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingModalError, setLoadingModalError] = useState<string | null>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // ── Load report (Plan Review's "report mode") ─────────────────────────────
  // reportLines/reportLoadId drive LoadingModal's post-load report view --
  // set either right after a real completion (below) or by openLoadReport
  // (page.tsx's "view last load at this terminal" button, for a load
  // completed in an earlier session). activeLoadId is cleared on completion
  // (existing behavior, so the LOAD button resets) -- reportLoadId is the
  // one that survives, since Edit Load/Delete Load need a real id to act on
  // regardless of how the report got opened.
  const [reportLines, setReportLines] = useState<ReportLine[] | null>(null);
  const [reportLoadId, setReportLoadId] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [actualByComp, setActualByComp] = useState<
    Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }>
  >({});

  const [loadReport, setLoadReport] = useState<LoadReport | null>(null);
  // Payload utilization for the load just completed. Null until a load
  // completes, and stays null whenever the measurement couldn't run (no
  // solvable plan, or the RPC failed -- it is deliberately non-fatal).
  const [loadUtilization, setLoadUtilization] = useState<LoadUtilizationResult | null>(null);

  const PLAN_SNAPSHOT_VERSION = 1;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function alphaPerFForProductId(productId: string): number | null {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.alpha_per_f == null) return null;
    const v = Number(p.alpha_per_f);
    return Number.isFinite(v) ? v : null;
  }

  function computePlannedGrossLbs(): number | null {
    if (![tare, plannedWeightLbs].every((x) => Number.isFinite(x))) return null;
    return tare + plannedWeightLbs;
  }

  return {
    authUserId,
    selectedComboId,
    selectedTerminalId,
    selectedRackId,
    selectedState,
    selectedCity,
    selectedCityId,
    tare,
    cgBias,
    ambientTempF,
    tempF,
    planRows,
    plannedGallonsTotal,
    plannedWeightLbs,
    terminalProducts,
    productNameById,
    setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalProducts,
    onRefreshTerminalAccess,
    onPostLoadComplete,
    predictedTempF,
    unbiasedPredictedTempF,
    activeSlotLetter,
    capacityResult,
    activeLoadId,
    setActiveLoadId,
    beginLoadBusy,
    setBeginLoadBusy,
    loadingOpen,
    setLoadingOpen,
    loadingModalError,
    setLoadingModalError,
    completeOpen,
    setCompleteOpen,
    completeBusy,
    setCompleteBusy,
    completeError,
    setCompleteError,
    reportLines,
    setReportLines,
    reportLoadId,
    setReportLoadId,
    reportBusy,
    setReportBusy,
    reportError,
    setReportError,
    actualByComp,
    setActualByComp,
    loadReport,
    setLoadReport,
    loadUtilization,
    setLoadUtilization,
    PLAN_SNAPSHOT_VERSION,
    alphaPerFForProductId,
    computePlannedGrossLbs,
  };
}
