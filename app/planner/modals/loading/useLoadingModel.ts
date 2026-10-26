"use client";
// app/planner/modals/loading/useLoadingModel.ts
//
// The Plan Review / load report model: composes the basics and the finish sequence and adds the report sums.

import { useMemo } from "react";
import { delayReasonOk, numOrNull } from "../../components/trip/tripUi";
import { delayMinutes, needsDelayReason, timesProblem } from "@/lib/trips/tripFlow";
import type { LoadingModalProps } from "./types";

import { useLoadingBasics } from "./useLoadingBasics";
import { useFinishSequence } from "./useFinishSequence";

export function useLoadingModel(props: LoadingModalProps) {
  const b = useLoadingBasics(props);
  const s = useFinishSequence(props, b);
  const {
    productNameById,
    productHexCodeById,
    livePreviewGrossLbs,
    report,
    onLoaded,
    loadedDisabled,
    trip,
    plannedLines,
    editingReport,
    orderedCompLines,
  } = b;
  const {
    compSeqIndex,
    compEntries,
    tripExtras,
    setTripStep,
    tripTimes,
    tripReasonId,
    tripNote,
    tripOdometer,
    tripSigned,
    setTripStepError,
    seqGroups,
    seqGroup,
  } = s;
  const showLivePreview = livePreviewGrossLbs != null;

  const totalPlannedGallons = useMemo(() => plannedLines.reduce((sum, x) => sum + x.gallons, 0), [plannedLines]);

  // ── Report mode: per-product sums + whole-load total + basis rows ───────
  const reportLinesSorted = useMemo(() => (report ? [...report.lines].sort((a, b) => a.comp - b.comp) : []), [report]);
  const reportByProduct = useMemo(() => {
    const map = new Map<
      string,
      { productId: string; gallons: number; lbs: number; apiSum: number; apiCount: number; tempSum: number; tempCount: number }
    >();
    for (const l of reportLinesSorted) {
      const cur = map.get(l.productId) ?? { productId: l.productId, gallons: 0, lbs: 0, apiSum: 0, apiCount: 0, tempSum: 0, tempCount: 0 };
      cur.gallons += l.gallons;
      cur.lbs += l.lbs ?? 0;
      if (l.api != null) {
        cur.apiSum += l.api;
        cur.apiCount += 1;
      }
      if (l.tempF != null) {
        cur.tempSum += l.tempF;
        cur.tempCount += 1;
      }
      map.set(l.productId, cur);
    }
    return Array.from(map.values());
  }, [reportLinesSorted]);
  const reportTotalGallons = reportByProduct.reduce((s, p) => s + p.gallons, 0);
  const reportTotalLbs = reportByProduct.reduce((s, p) => s + p.lbs, 0);
  const reportBasisRows = reportByProduct.map((p) => ({
    productId: p.productId,
    api: p.apiCount > 0 ? p.apiSum / p.apiCount : null,
    tempF: p.tempCount > 0 ? p.tempSum / p.tempCount : null,
    lbsPerGal: p.gallons > 0 ? p.lbs / p.gallons : null,
  }));

  function finishTimesStep() {
    if (!trip || !tripTimes) return;
    const tp = timesProblem(tripTimes);
    if (tp) return setTripStepError(tp);
    if (!delayReasonOk(tripTimes, trip.settings.loading_delay_threshold_minutes, tripReasonId, tripNote))
      return setTripStepError("Pick a delay reason.");
    if (trip.needsOdometer && numOrNull(tripOdometer) == null) return setTripStepError("Enter the odometer.");
    setTripStepError(null);
    setTripStep("sign");
  }
  function finishSignStep() {
    if (!trip || !tripTimes) return;
    if (!tripSigned) return setTripStepError("Accept your signature to finish.");
    const delayNeeded = needsDelayReason(
      delayMinutes(tripTimes.arrivedAt, tripTimes.beginAt),
      trip.settings.loading_delay_threshold_minutes,
    );
    setTripStep(null);
    onLoaded(compEntries, {
      byComp: tripExtras,
      times: tripTimes,
      delayReasonId: delayNeeded ? tripReasonId : null,
      delayNote: delayNeeded && !tripReasonId ? tripNote.trim() || null : null,
      odometer: trip.needsOdometer ? numOrNull(tripOdometer) : trip.existingOdometer,
      signed: tripSigned,
    });
  }
  const seqDot = seqGroup
    ? (productHexCodeById?.[seqGroup.productId] && String(productHexCodeById[seqGroup.productId]).trim()) || "rgba(255,255,255,0.5)"
    : undefined;
  const seqLabel = seqGroup
    ? `${productNameById.get(seqGroup.productId) ?? seqGroup.productId}${seqGroup.bolCount > 1 ? ` · BOL ${seqGroup.bolIndex} of ${seqGroup.bolCount}` : ""}`
    : "";
  const seqProductCompCount = seqGroup ? orderedCompLines.filter((l) => l.productId === seqGroup.productId).length : 0;
  const seqIsLast = compSeqIndex != null && compSeqIndex >= seqGroups.length - 1;
  const seqSubmitLabel = !seqIsLast ? "Next" : editingReport ? "Save Load" : trip ? "Next" : "Finish Loading";

  const busy = Boolean(loadedDisabled);

  return {
    ...b,
    ...s,
    showLivePreview,
    totalPlannedGallons,
    reportLinesSorted,
    reportByProduct,
    reportTotalGallons,
    reportTotalLbs,
    reportBasisRows,
    finishTimesStep,
    finishSignStep,
    seqDot,
    seqLabel,
    seqProductCompCount,
    seqSubmitLabel,
    busy,
  };
}

export type LoadingModel = ReturnType<typeof useLoadingModel>;
