"use client";
// app/planner/hooks/loadWorkflow/useLoadComplete.ts
//
// Completing a load from Plan Review (complete_load and its follow-ups).

import { useCallback } from "react";
import { completeLoad } from "@/lib/supabase/load";
import { computeActualLbsForLine, resolveDensestReadingPerProduct } from "../../utils/planMath";
import type { CompartmentActualReading } from "../../utils/planMath";
import { updateTerminalTempBias, recordLoadUtilization, writeRackReadings } from "../../utils/loadSideEffects";
import { clearActivePlannedLoad } from "../../utils/activePlannedLoad";
import { getTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import { recordLoadCompleted } from "@/lib/trips/tripFlow";
import { netMethodForProduct } from "@/lib/trips/netGallons";

import type { Props } from "./types";
import { friendlyLoadError } from "./friendlyError";

import type { useLoadWorkflowState } from "./useLoadWorkflowState";
import type { useLoadStart } from "./useLoadStart";
import type { useLoadCancel } from "./useLoadCancel";

export function useLoadComplete(
  props: Props,
  k: ReturnType<typeof useLoadWorkflowState>,
  b: ReturnType<typeof useLoadStart>,
  c: ReturnType<typeof useLoadCancel>,
) {
  const {
    authUserId,
    selectedTerminalId,
    selectedRackId,
    tare,
    tempF,
    planRows,
    plannedGallonsTotal,
    terminalProducts,
    productNameById,
    onRefreshTerminalProducts,
    onRefreshTerminalAccess,
    onPostLoadComplete,
    predictedTempF,
    unbiasedPredictedTempF,
    activeSlotLetter,
    capacityResult,
    activeLoadId,
    setActiveLoadId,
    setCompleteBusy,
    setCompleteError,
    setReportLines,
    setReportLoadId,
    setReportError,
    setActualByComp,
    setLoadReport,
    setLoadUtilization,
    alphaPerFForProductId,
    computePlannedGrossLbs,
  } = k;
  // ── On loaded (from loading modal) ────────────────────────────────────────
  // compEntries: one real, driver-entered {gallons, api, tempF} per physical
  // compartment (see LoadingModal.tsx's per-compartment Log-the-Load
  // sequence) -- this is what makes actual_gallons genuinely "actual" for
  // the first time, instead of a copy of the plan.

  const onLoadedFromLoadingModal = useCallback(
    async (
      compEntries: Record<number, { gallons: number; api: number; tempF: number }>,
      opts?: { loadId?: string; afterTripRecord?: () => void },
    ) => {
      // opts.loadId is set only by the "Edit Load" path (page.tsx wraps this
      // in onEditLoad, passing reportLoadId) -- re-running this exact
      // function against an ALREADY-loaded load_id is what makes an edit a
      // real correction (same complete_load RPC, same side effects: rack
      // last-observed reading, temp bias, payload utilization -- all of
      // which SHOULD reflect a corrected reading, not just the first one).
      const targetLoadId = opts?.loadId ?? activeLoadId;
      if (!targetLoadId) return;

      const plannedLines = (planRows as any[]).filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0);

      for (const r of plannedLines) {
        const comp = Number(r?.comp_number ?? 0);
        const entry = compEntries[comp];
        if (!entry || !Number.isFinite(entry.gallons) || !Number.isFinite(entry.api) || !Number.isFinite(entry.tempF)) {
          setCompleteError("Missing a compartment reading — reopen “Log the Load” and confirm every compartment.");
          return;
        }
      }

      const nextActualByComp: Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }> = {};
      const readings: CompartmentActualReading[] = [];
      let actualPayloadLbs = 0;

      for (const r of plannedLines) {
        const comp = Number(r?.comp_number ?? 0);
        const pid = r?.productId ? String(r.productId) : null;
        if (!Number.isFinite(comp) || comp <= 0 || !pid) continue;

        const entry = compEntries[comp];
        const gallons = entry.gallons;
        const apiNum = entry.api;
        const tempVal = entry.tempF;
        const alpha = alphaPerFForProductId(pid);

        readings.push({ comp, productId: pid, gallons, api: apiNum, tempF: tempVal, alphaPerF: alpha });

        if (alpha == null) {
          const lpgPlanned = Number(r?.lbsPerGal ?? 0);
          const lbsPlanned = gallons * (Number.isFinite(lpgPlanned) ? lpgPlanned : 0);
          nextActualByComp[comp] = {
            actual_gallons: gallons,
            actual_lbs: Number.isFinite(lbsPlanned) ? lbsPlanned : null,
            temp_f: tempVal,
          };
          actualPayloadLbs += Number.isFinite(lbsPlanned) ? lbsPlanned : 0;
          continue;
        }

        // Back-correct observed API to 60°F before computing lbs/gal —
        // matches bestLbsPerGallon used in planning. Without this, plan and
        // actual use different effective API60 causing a phantom diff.
        const lbs = computeActualLbsForLine(gallons, apiNum, tempVal, alpha);
        nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbs) ? lbs : null, temp_f: tempVal };
        if (Number.isFinite(lbs)) actualPayloadLbs += lbs;
      }

      setActualByComp(nextActualByComp);

      try {
        setCompleteBusy(true);
        setCompleteError(null);

        const lines = readings.map((a) => ({
          comp_number: a.comp,
          actual_gallons: nextActualByComp[a.comp]?.actual_gallons ?? null,
          actual_lbs: nextActualByComp[a.comp]?.actual_lbs ?? null,
          temp_f: nextActualByComp[a.comp]?.temp_f ?? null,
          actual_api: Number.isFinite(a.api) ? a.api : null,
        }));

        // product_updates feeds rack_product_status's shared "last observed"
        // terminal reading -- one entry per product, picking whichever
        // compartment's reading was colder & denser (see planMath.ts's own
        // doc comment). A product with zero valid entries (every compartment
        // for it got zeroed out) is simply absent -- never a fabricated row.
        const product_updates = resolveDensestReadingPerProduct(readings).map((r) => ({
          product_id: r.productId,
          api: r.api,
          temp_f: r.tempF as number | null,
        }));

        const res = await completeLoad({
          load_id: targetLoadId,
          lines,
          completed_at: new Date().toISOString(),
          product_updates,
        });

        // Trip workflow (phase 3): the load's compartments become the trip's
        // compartment loads (net calculated), on the pickup this load is attached
        // to. Local write, non-fatal; no trip -> nothing happens.
        if (authUserId) {
          try {
            recordLoadCompleted(getTripStore(authUserId), {
              userId: authUserId,
              loadId: targetLoadId,
              readings: readings.map((r) => ({
                comp: r.comp,
                productId: r.productId,
                gallons: r.gallons,
                api: Number.isFinite(r.api) ? r.api : null,
                tempF: r.tempF != null && Number.isFinite(r.tempF) ? r.tempF : null,
                netMethod: netMethodForProduct(productNameById.get(r.productId) ?? null),
              })),
              now: new Date(),
              newId: newTripId,
            });
          } catch (e) {
            console.warn("[trips] record load on trip failed (non-fatal):", e);
          }
          // Planner trip mode: BOL, supplier, net, times, signature land on the
          // compartment loads just written above.
          try {
            opts?.afterTripRecord?.();
          } catch (e) {
            console.warn("[trips] trip details after load failed (non-fatal):", e);
          }
        }

        await updateTerminalTempBias({
          selectedTerminalId,
          basisPredictedTempF: unbiasedPredictedTempF ?? predictedTempF,
          nextActualByComp,
        });

        const utilizationResult = await recordLoadUtilization(targetLoadId, capacityResult);

        await writeRackReadings({ selectedRackId, selectedTerminalId, product_updates, terminalProducts, authUserId });

        const plannedGross = computePlannedGrossLbs();
        const actualGross = Number.isFinite(tare) && Number.isFinite(actualPayloadLbs) ? tare + actualPayloadLbs : null;
        // Always compute client-side now, never prefer res.diff_lbs -- the
        // server's figure is derived from load_log's begin_load-time frozen
        // snapshot, which the Loading modal's Plan Review phase can now
        // legitimately move away from (a Phase-1 gallons override). Using the
        // server's stale number here would silently disagree with
        // planned_gross_lbs right next to it, which already reflects the
        // live, possibly-adjusted plan (computePlannedGrossLbs() reads the
        // effective props passed into this hook, not the DB row).
        const diff = plannedGross != null && actualGross != null ? actualGross - plannedGross : null;

        setLoadReport({
          planned_total_gal: Number(plannedGallonsTotal),
          planned_gross_lbs: plannedGross,
          actual_gross_lbs: actualGross,
          diff_lbs: diff,
          completed_at: res?.completed_at ?? new Date().toISOString(),
          plan_slot: activeSlotLetter ?? null,
          // Same shape usePlanSlots reads back from load_utilization when a past
          // load is restored, so the Planner card has one field to render from
          // regardless of which path produced the report.
          utilization: utilizationResult
            ? {
                available_gallons: utilizationResult.available_gallons,
                effective_available_gallons: utilizationResult.effective_available_gallons,
                actual_gallons: utilizationResult.actual_gallons,
                unused_gallons: utilizationResult.unused_gallons,
                utilization_pct: utilizationResult.utilization_pct,
                eligibility: utilizationResult.eligibility,
                exception_reason: utilizationResult.exception_reason,
              }
            : null,
        });
        setLoadUtilization(utilizationResult);
        // Per explicit direction, the modal no longer closes on a successful
        // completion -- it repurposes into a Load Report (see reportLines/
        // reportLoadId below, and LoadingModal's own "report mode"). Closing
        // is now an explicit driver action ("New Load"), handled by page.tsx.
        setReportLines(
          readings.map((r) => ({
            comp: r.comp,
            productId: r.productId,
            gallons: r.gallons,
            lbs: nextActualByComp[r.comp]?.actual_lbs ?? null,
            api: Number.isFinite(r.api) ? r.api : null,
            tempF: Number.isFinite(r.tempF) ? r.tempF : null,
          })),
        );
        setReportLoadId(targetLoadId);
        setReportError(null);
        // activeLoadId was previously only ever cleared in cancelActiveLoad
        // (Update Card/Back to Planner) -- never on a genuine successful
        // completion, so the LOAD button stayed stuck reading "Load started"
        // until a full page reload. Clear it here too so loadLabel correctly
        // falls back to RELOAD/LOAD immediately after a real completed load.
        // (A no-op when this call came from Edit Load -- activeLoadId is
        // already null by then.)
        setActiveLoadId(null);
        // Load is finalized -- a reopen should NOT resume it (only a completed
        // load's residue pre-fills, the pre-existing behavior). See activePlannedLoad.
        clearActivePlannedLoad(authUserId);

        // ── Post-load refresh (don't reset loadReport — it's set above) ─────────
        // Fire in parallel — neither touches loadReport state
        await Promise.allSettled([onRefreshTerminalProducts?.(), onRefreshTerminalAccess?.(), onPostLoadComplete?.()]);
      } catch (e: any) {
        console.error("complete_load failed:", e);
        // The Loading modal is still open here (setLoadingOpen(false) only runs
        // on success), so surface the error in its own themed banner
        // (errorMessage <- completeError, wired in page.tsx) and let the driver
        // re-tap "Log the Load" once signal returns -- no blocking native alert,
        // and nothing was submitted, so the completed physical load isn't lost.
        setCompleteError(friendlyLoadError(e, "Could not log the load."));
      } finally {
        setCompleteBusy(false);
      }
    },
    [
      activeLoadId,
      planRows,
      tare,
      plannedGallonsTotal,
      terminalProducts,
      selectedTerminalId,
      selectedRackId,
      tempF,
      onRefreshTerminalProducts,
      onRefreshTerminalAccess,
      onPostLoadComplete,
      activeSlotLetter,
      capacityResult,
      authUserId,
    ],
  );

  return {
    onLoadedFromLoadingModal,
  };
}
