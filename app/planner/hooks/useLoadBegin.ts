"use client";
// app/planner/hooks/useLoadBegin.ts
//
// Starting, leaving and re-opening a load: Back to Planner (undo the load and the
// card), the begin sequence after the stale-API choice, reporting a terminal issue,
// and recalling the last load. Lifted out of PlannerHost unchanged.

import { openAccessSteps } from "../utils/openAccessSteps";
import { useCallback, useEffect, useRef } from "react";
import { submitOutageReport, type OutageReportType } from "./useTerminalOutageReports";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useLoadWorkflow } from "./useLoadWorkflow";
import type { usePlanSlots } from "./usePlanSlots";
import type { usePlanInputs } from "./usePlanInputs";
import type { useFuelTempPrediction } from "./useFuelTempPrediction";

type Inputs = {
  beginAfterOverride: boolean;
  effectiveUserId: string | null | undefined;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  planSlots: ReturnType<typeof usePlanSlots>;
  preLoadCardedOnRef: MutableRefObject<{ terminalId: string; prevValue: string | null } | null>;
  predictedFuelTempF: ReturnType<typeof useFuelTempPrediction>["predictedFuelTempF"];
  refreshFuelTemp: ReturnType<typeof useFuelTempPrediction>["refresh"];
  resolvedSupplierPicksRef: MutableRefObject<{ product_id: string; supplier_id: string | null; name: string }[]>;
  setActiveSlotLetter: Dispatch<SetStateAction<number>>;
  setAltEquipmentPrompt: Dispatch<SetStateAction<{ loadId: string; truckLabel: string; trailerLabel: string } | null>>;
  setApiSafetyOverride: Dispatch<SetStateAction<Record<string, number>>>;
  setBeginAfterOverride: Dispatch<SetStateAction<boolean>>;
  setCancelLoadConfirmOpen: Dispatch<SetStateAction<boolean>>;
  setCaptureBaselineNext: Dispatch<SetStateAction<boolean>>;
  setProductTempF: Dispatch<SetStateAction<Record<string, number>>>;
  setTempF: ReturnType<typeof usePlanInputs>["setTempF"];
  setTunedApiTempByProduct: Dispatch<SetStateAction<Record<string, { api: number; tempF: number }>>>;
  shell: ReturnType<typeof useCalculatorShell>;
  tempFRef: MutableRefObject<number>;
  userAdjustedTempRef: MutableRefObject<boolean>;
};

export function useLoadBegin(i: Inputs) {
  const { beginAfterOverride, effectiveUserId, loadWorkflow, planSlots, preLoadCardedOnRef, predictedFuelTempF, refreshFuelTemp, resolvedSupplierPicksRef, setActiveSlotLetter, setAltEquipmentPrompt, setApiSafetyOverride, setBeginAfterOverride, setCancelLoadConfirmOpen, setCaptureBaselineNext, setProductTempF, setTempF, setTunedApiTempByProduct, shell, tempFRef, userAdjustedTempRef } = i;
  const { equipment, location, terminals } = shell;
  // "Back to Planner" -- per explicit follow-up, this must genuinely undo
  // everything: no load logged AND the terminal card reverted to whatever
  // it was before this LOAD tap (not left at the fresh re-card the way
  // "Update Card, No Load" deliberately keeps). Cancels the load first
  // (closes the modal, deletes the load_log row), then restores the
  // captured pre-load access date -- or, if there was none, deletes the
  // row entirely so the terminal goes back to genuinely "not carded"
  // rather than picking some fallback date that was never real.
  const handleBackToPlannerNoUpdate = useCallback(async () => {
    setCancelLoadConfirmOpen(false);
    await loadWorkflow.cancelActiveLoad();
    const captured = preLoadCardedOnRef.current;
    preLoadCardedOnRef.current = null;
    if (!captured) return;
    if (captured.prevValue) {
      await terminals.setAccessDateForTerminal(captured.terminalId, captured.prevValue);
    } else {
      await terminals.deleteAccessDateForTerminal(captured.terminalId);
    }
  }, [loadWorkflow, terminals]);

  // ── LOAD -> (stale-API check) -> begin ───────────────────────────────────
  // The pre-load temp-confirm step (ProductTempModal on the LOAD tap) is
  // gone -- temp is now entered per product at Log the Load. LOAD instead
  // checks for stale/missing API readings and, if any, offers the Good /
  // Better / Best safety overlay before beginning; otherwise it begins
  // directly. (ProductTempModal is still used for the mid-load different-
  // city reconfirm -- handleConfirmTempReconfirm below.)
  //
  // requestBegin sets the chosen per-product density override and defers the
  // actual begin to the effect below, so the load snapshots planRows that
  // already reflect the override (not the stale pre-override closure).
  const requestBegin = useCallback((override: Record<string, number>) => {
    setApiSafetyOverride(override);
    setBeginAfterOverride(true);
  }, []);

  useEffect(() => {
    if (!beginAfterOverride) return;
    setBeginAfterOverride(false);
    preLoadCardedOnRef.current = {
      terminalId: location.selectedTerminalId,
      prevValue: terminals.accessDateByTerminalId[location.selectedTerminalId] ?? null,
    };
    loadWorkflow.beginLoadToSupabase();
    // Terminal access steps: starts them if there's no access here, or shows
    // what's left if they're underway (see AccessStepsHost).
    if (location.selectedTerminalId) {
      openAccessSteps({ terminalId: String(location.selectedTerminalId), fromLoad: { prevCardedOn: preLoadCardedOnRef.current.prevValue } });
    }
    // beginLoadToSupabase closes over the current (post-override) planRows;
    // this effect runs after that render commits, so the snapshot is fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginAfterOverride]);

  // Clear the safety override AND the Tune-panel overrides whenever the Loading
  // modal closes (complete, cancel, update-card, or back) so a heavier
  // assumption or a driver's tuned reading never lingers into the planner view
  // or the next load.
  useEffect(() => {
    if (!loadWorkflow.loadingOpen) { setApiSafetyOverride({}); setTunedApiTempByProduct({}); }
  }, [loadWorkflow.loadingOpen]);

  // A temp override (Tune panel or the Confirm Temp dial) is for that load
  // only. When the Loading modal closes after being open, drop every
  // per-product temp back to the system value and let the prediction take
  // over again. Gated on a real open -> close transition so it never fires
  // on mount. A page refresh already lands here: productTempF isn't
  // persisted and userAdjustedTempRef starts false, so auto-apply wins.
  const wasLoadingOpenRef = useRef(false);
  useEffect(() => {
    const was = wasLoadingOpenRef.current;
    wasLoadingOpenRef.current = loadWorkflow.loadingOpen;
    if (!was || loadWorkflow.loadingOpen) return;
    userAdjustedTempRef.current = false;
    const base = predictedFuelTempF ?? tempFRef.current;
    if (predictedFuelTempF != null) setTempF(predictedFuelTempF);
    setProductTempF((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const out: Record<string, number> = {};
      for (const k of keys) out[k] = Math.round(base * 10) / 10;
      return out;
    });
    refreshFuelTemp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadWorkflow.loadingOpen]);

  // computeStalePlannedProducts / buildStaleOverride / handleStale* live
  // further down, after lastProductInfoById + productHexCodeById are declared
  // (they reference those), so they aren't in this block.

  // Wired into CancelLoadSheet's new "Report Terminal Issue" flow -- see
  // CLAUDE.md "Terminal outage banners." Stays a thin call-through to the
  // actual write logic in useTerminalOutageReports.ts, matching how
  // handleBackToPlannerNoUpdate above is the only place that touches
  // loadWorkflow/terminals for its own concern.
  //
  // Optional terminal/rack override, added for
  // TerminalSwitchDuringLoadSheet's own "Report Terminal Issue" -- that
  // sheet's report is about the terminal the driver was ALREADY loading
  // at (the previous one, from the switch snapshot), not whichever
  // terminal the picker just left `location.selectedTerminalId` pointing
  // at. CancelLoadSheet's own call site never passes these, so its
  // existing behavior (report against the live current selection) is
  // completely unchanged.
  const handleSubmitOutageReport = useCallback(
    async (reportType: OutageReportType, productIds: string[], overrideTerminalId?: string, overrideRackId?: string | null) => {
      const truckId = equipment.selectedCombo?.truck_id ?? "";
      const truckLabel = equipment.truckNameById[truckId] ?? truckId;
      const base = {
        terminalId: overrideTerminalId ?? String(location.selectedTerminalId || ""),
        selectedRackId: overrideTerminalId ? (overrideRackId ?? null) : (location.selectedRackId ? String(location.selectedRackId) : null),
        reportType,
        companyId: shell.companyId || "",
        userId: effectiveUserId || "",
        truckLabel,
      };
      // Allocation at this terminal names the supplier picked for each
      // product, one report per supplier ("No Allocation - Atlas - MO (D2)").
      if (reportType === "out_of_allocation" && !overrideTerminalId) {
        const picks = resolvedSupplierPicksRef.current;
        const bySupplier = new Map<string, { supplier: { supplier_id: string | null; name: string } | null; ids: string[] }>();
        for (const pid of productIds) {
          const pk = picks.find((x) => x.product_id === pid);
          const key = pk ? (pk.supplier_id ?? pk.name) : "";
          const g = bySupplier.get(key) ?? { supplier: pk ? { supplier_id: pk.supplier_id, name: pk.name } : null, ids: [] };
          g.ids.push(pid);
          bySupplier.set(key, g);
        }
        for (const g of bySupplier.values()) {
          const r = await submitOutageReport({ ...base, productIds: g.ids, supplier: g.supplier });
          if (r.error) return r;
        }
        return { error: null };
      }
      return submitOutageReport({ ...base, productIds });
    },
    [equipment.selectedCombo, equipment.truckNameById, location.selectedTerminalId, location.selectedRackId, shell.companyId, effectiveUserId]
  );

  // Pushes a recalled load's report into loadWorkflow and re-syncs the
  // preset dial -- shared by the normal "Recall Last Load" tap and the
  // "switch equipment, then recall" path below, since both end the same
  // way once a report actually comes back.
  const applyRecalledReport = useCallback((report: any | null) => {
    if (report) {
      loadWorkflow.setLoadReport(report);
      // planSlots.recallLastLoad() already called setCompPlan/setCgSlider
      // (via applySnapshot) before this runs -- without this, the "Save
      // Plan" button's dirty-check compared the just-recalled plan against
      // whatever baseline was captured BEFORE the recall, so it showed up
      // immediately even though nothing the driver actually did had
      // changed anything yet. Same captureBaselineNext mechanism every
      // other programmatic plan-load (preset tap, terminal/combo switch)
      // already uses -- this was the one path that never set it.
      setCaptureBaselineNext(true);
    }
    if (report?.plan_slot) {
      setActiveSlotLetter(report.plan_slot);
    }
  }, [loadWorkflow]);

  // "Recall Last Load" -- tries the current equipment first (the common
  // case); if this terminal has no completed load under it, checks
  // whether the driver's own last load HERE used different equipment
  // before giving up silently, per explicit follow-up. Never claims/
  // switches equipment -- see RecallDifferentEquipmentSheet.tsx's own
  // comment for why (someone else could genuinely be running it).
  const handleRecallLastLoad = useCallback(async () => {
    const report = await planSlots.recallLastLoad();
    if (report) { applyRecalledReport(report); return; }
    if (!location.selectedTerminalId) return;
    const match = await planSlots.findLastLoadAtTerminalDifferentEquipment(String(location.selectedTerminalId));
    if (match) setAltEquipmentPrompt(match);
  }, [planSlots, applyRecalledReport, location.selectedTerminalId]);

  // "View last load" button (replaces the old always-visible last-load/
  // utilization cards, per explicit direction). A real, separate concern
  // from the plan-restore machinery above -- this never touches compPlan
  // or any slot storage, it's a pure read of load_log/load_lines for
  // display in Plan Review's own Load Report mode. Scoped to the CURRENT
  // terminal (per explicit direction: "reopen the last load at that
  // terminal"), not just this combo's most recent load anywhere.

  return { handleBackToPlannerNoUpdate, handleRecallLastLoad, handleSubmitOutageReport, requestBegin };
}
