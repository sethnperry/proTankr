"use client";
// app/planner/hooks/useTerminalSwitchDuringLoad.ts
//
// Everything about switching terminals from inside the Planner: tapping the
// terminal name in Plan Review, the "what about your card?" confirm, rack hops
// on a trip, re-seeding API/temp for the new terminal, and the report-issue
// path. Lifted out of PlannerHost unchanged; the host passes in the state it
// shares with the rest of the Planner.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "@/lib/supabase/client";
import { getTripStore, type useTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import type { TripPickupRow } from "@/lib/trips/types";
import { retagLoadPickup, retargetWaitingPickup } from "@/lib/trips/tripLogic";
import { addPickup, closePickupNoLoad } from "@/lib/trips/tripFlow";
import { writeActivePlannedLoad } from "../utils/activePlannedLoad";
import type { OutageReportType } from "./useTerminalOutageReports";
import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useLoadWorkflow } from "./useLoadWorkflow";

export type TerminalSnapshot = {
    terminalId: string; terminalName: string; rackId: string; city: string; state: string;
  };

type Args = {
  shell: ReturnType<typeof useCalculatorShell>;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  tripStoreHook: ReturnType<typeof useTripStore>;
  tripPickup: TripPickupRow | null;
  tripWaitingPickup: TripPickupRow | null;
  effectiveUserId: string | null | undefined;
  terminalLabel: string | null | undefined;
  effectivePlanRows: any[];
  setProductApi: (productId: string, api: string) => void;
  setProductTemp: (productId: string, tempF: number) => void;
  setTunedApiTempByProduct: Dispatch<SetStateAction<Record<string, { api: number; tempF: number }>>>;
  userAdjustedTempRef: MutableRefObject<boolean>;
  setTempDialOpen: (open: boolean) => void;
  setTempF: (v: number | ((prev: number) => number)) => void;
  tempF: number;
  fuelTempLoading: boolean;
  predictedFuelTempF: number | null;
  handleSubmitOutageReport: (
    reportType: OutageReportType, productIds: string[], overrideTerminalId?: string, overrideRackId?: string | null,
  ) => Promise<{ error: string | null }>;
};

export function useTerminalSwitchDuringLoad(a: Args) {
  const {
    shell, loadWorkflow, tripStoreHook, tripPickup, tripWaitingPickup, effectiveUserId, terminalLabel,
    effectivePlanRows, setProductApi, setProductTemp, setTunedApiTempByProduct, userAdjustedTempRef,
    setTempDialOpen, setTempF, tempF, fuelTempLoading, predictedFuelTempF, handleSubmitOutageReport,
  } = a;
  const { location, equipment, terminals } = shell;
  // ── Mid-load terminal switch (Plan Review's tappable terminal name) ────────
  // Per explicit direction: tapping the terminal name in LoadingModal opens
  // the shared location/terminal picker without leaving Plan Review. If
  // that picker actually changes the terminal, TerminalSwitchDuringLoadSheet
  // asks what to do about it once the picker (and any rack pick it triggers)
  // settles -- see that component's own header comment for the three
  // choices' exact semantics.
  //
  // terminalSwitchWatch is a snapshot of "what was true right before the
  // picker opened" plus a flag that an effect below is actively waiting for
  // the picker to close; terminalSwitchConfirm is the resolved before/after
  // pair once it has (only set when the terminal genuinely changed -- if
  // the driver closes the picker without picking anything, or re-picks the
  // same terminal, nothing happens and Plan Review is exactly as it was).

  const [terminalSwitchWatch, setTerminalSwitchWatch] = useState<TerminalSnapshot | null>(null);
  const [terminalSwitchConfirm, setTerminalSwitchConfirm] = useState<{ prev: TerminalSnapshot; next: TerminalSnapshot } | null>(null);

  // "Couldn't load" from Plan Review: why, then the terminal picker, then the hop is applied with no
  // card update, then the new terminal's sourcing, then the dashboard. stage "apply" runs the hop.
  const [couldntLoad, setCouldntLoad] = useState<
    | { stage: "reason" | "pick"; prev: TerminalSnapshot }
    | { stage: "apply"; prev: TerminalSnapshot; next: TerminalSnapshot }
    | { stage: "supplier"; hopped: boolean }
    | null
  >(null);

  const handleTapTerminalInLoadingModal = useCallback(() => {
    setTerminalSwitchWatch({
      terminalId: String(location.selectedTerminalId || ""),
      terminalName: terminalLabel || "Terminal",
      rackId: String(location.selectedRackId || ""),
      city: location.selectedCity, state: location.selectedState,
    });
    shell.setTermOpen(true);
  }, [location.selectedTerminalId, location.selectedRackId, location.selectedCity, location.selectedState, terminalLabel, shell]);

  // Waits for the picker (and any rack-pick it triggers) to fully settle --
  // shell.termOpen/locOpen/rackPickerOpen are the three sheets this could
  // still be mid-flight through (picking a new city via "Change" routes
  // through locOpen too); shell.rackResolving covers the real gap between
  // picking a terminal and rackPickerOpen actually flipping true a moment
  // later (an awaited network round trip) -- confirmed live this gap is
  // real: without it, this effect could fire and open the terminal-switch
  // confirm sheet at the same instant the rack picker was about to open,
  // showing both at once. Only opens the confirm sheet if the terminal
  // genuinely ended up different from the snapshot; otherwise this was just
  // a look, not a switch, and Plan Review needs no further interruption.
  useEffect(() => {
    if (!terminalSwitchWatch) return;
    if (shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving) return;
    const prev = terminalSwitchWatch;
    setTerminalSwitchWatch(null);
    const newTerminalId = String(location.selectedTerminalId || "");
    if (!newTerminalId || newTerminalId === prev.terminalId) { setCouldntLoad(null); return; }
    if (couldntLoad?.stage === "pick") {
      setCouldntLoad({
        stage: "apply", prev,
        next: { terminalId: newTerminalId, terminalName: terminalLabel || "Terminal", rackId: String(location.selectedRackId || ""), city: location.selectedCity, state: location.selectedState },
      });
      return;
    }
    setTerminalSwitchConfirm({
      prev,
      next: {
        terminalId: newTerminalId,
        terminalName: terminalLabel || "Terminal",
        rackId: String(location.selectedRackId || ""),
        city: location.selectedCity, state: location.selectedState,
      },
    });
  }, [terminalSwitchWatch, shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, location.selectedTerminalId, location.selectedRackId, location.selectedCity, location.selectedState, terminalLabel, couldntLoad]);

  // Every planned product's id -- used both to re-seed API/Temp after a
  // confirmed switch (below) and to scope the "Report Terminal Issue"
  // product picker to this load's own plan (via handleSubmitOutageReport).
  const plannedProductIdsForSwitch = useMemo(
    () => Array.from(new Set(
      (effectivePlanRows as any[])
        .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
        .map((r) => String(r.productId))
    )),
    [effectivePlanRows]
  );

  // Applies the terminal switch that's ALREADY live in `location` (the
  // picker wrote it directly, before this sheet ever opened) -- shared by
  // both outcomes below, since leaving the previous terminal is never in
  // question here. Per explicit direction: "the only reason to stay at a
  // terminal is to load the truck. If we can't get loaded, we tap the
  // terminal name to switch... We are leaving the terminal. The only
  // question is whether or not the card gets updated." Retags the active
  // load's own terminal_id/rack_id (plain non-blocking UPDATE, same
  // pattern beginLoadToSupabase already uses for rack_id/plan_slot), keeps
  // the in-progress-load marker in sync so a close-and-reopen resumes at
  // the NEW terminal, re-seeds API for every planned product (clearing lets
  // LoadingModal's own prefill-if-empty effect re-populate once
  // terminalProducts resolves for the new terminal, same mechanism a fresh
  // LOAD tap already relies on), drops any Tune-panel overrides (they were
  // for the OLD terminal's reading), and refreshes temp -- silently in the
  // background if the city didn't change, or by reopening Confirm Temp for
  // a real review if it did (see the two effects below).
  // Issues reported from the switch sheet for the terminal being left; the
  // first one becomes that rack's "couldn't load" reason on the trip.
  const switchReportedIssueRef = useRef<string | null>(null);
  const switchReasonNoteRef = useRef<string | null>(null);

  const applyTerminalSwitch = useCallback((prev: TerminalSnapshot, next: TerminalSnapshot) => {
    // Trip workflow: leaving a rack mid-load is a rack hop. The rack is
    // recorded as "couldn't load" (with any issue reported in the sheet), the
    // load is cancelled (the plan stays), and the next terminal becomes a new
    // pickup the driver taps Arrived at when they get there. That keeps the
    // travel and time at each rack on the PTD.
    // A rack the driver already arrived at but hadn't started loading counts
    // too: they're leaving it, so it's a hop the same way.
    const hopPickup = loadWorkflow.activeLoadId ? tripPickup : (tripWaitingPickup?.arrived_at ? tripWaitingPickup : null);
    if (hopPickup && effectiveUserId) {
      const pickup = hopPickup;
      const hadLoad = !!loadWorkflow.activeLoadId;
      const reason = switchReportedIssueRef.current ?? "other";
      const reasonNote = switchReasonNoteRef.current;
      switchReportedIssueRef.current = null;
      switchReasonNoteRef.current = null;
      void (async () => {
        if (hadLoad) await loadWorkflow.cancelActiveLoad();
        try {
          const store = getTripStore(effectiveUserId);
          const fresh = store.list("trip_pickups", (x) => x.pickup_id === pickup.pickup_id)[0] ?? pickup;
          const now = new Date();
          closePickupNoLoad(store, {
            userId: effectiveUserId, pickup: fresh, reason, note: reasonNote,
            arrivedAt: fresh.arrived_at ?? pickup.begin_at ?? null, beginAt: pickup.begin_at,
            leftAt: now.toISOString(), now, newId: newTripId,
          });
          addPickup(store, {
            userId: effectiveUserId, tripId: fresh.trip_id,
            terminalId: next.terminalId || null, rackId: next.rackId || null,
            name: next.terminalName || null, city: next.city || null, state: next.state || null,
            now, newId: newTripId,
          });
          void tripStoreHook.syncNow();
        } catch (e) {
          console.warn("[trips] rack hop failed (non-fatal):", e);
        }
      })();
      return;
    }
    if (loadWorkflow.activeLoadId) {
      // Trip workflow: the trip's pickup follows the load to the new terminal.
      if (effectiveUserId) {
        try {
          retagLoadPickup(getTripStore(effectiveUserId), loadWorkflow.activeLoadId, {
            terminalId: next.terminalId || null, rackId: next.rackId || null,
            name: next.terminalName, city: next.city, state: next.state,
          });
        } catch (e) {
          console.warn("[trips] retag pickup failed (non-fatal):", e);
        }
      }
      supabase.from("load_log")
        .update({ terminal_id: next.terminalId, rack_id: next.rackId || null })
        .eq("load_id", loadWorkflow.activeLoadId)
        .then(({ error }) => { if (error) console.error("[terminal-switch] failed to retag load_log terminal:", error.message); });

      writeActivePlannedLoad(effectiveUserId || null, {
        loadId: loadWorkflow.activeLoadId,
        comboId: String(equipment.selectedComboId || ""),
        terminalId: String(next.terminalId || ""),
        rackId: next.rackId ? String(next.rackId) : null,
        state: String(next.state || ""),
        city: String(next.city || ""),
      });
    }

    for (const pid of plannedProductIdsForSwitch) setProductApi(pid, "");
    setTunedApiTempByProduct((prevMap) => {
      const nextMap = { ...prevMap };
      for (const pid of plannedProductIdsForSwitch) delete nextMap[pid];
      return nextMap;
    });

    const cityChanged = prev.city !== next.city || prev.state !== next.state;
    userAdjustedTempRef.current = false; // an explicit driver-triggered refresh should win over any earlier manual nudge
    if (cityChanged) {
      setTempReconfirmProductIds(plannedProductIdsForSwitch);
      setTempDialOpen(true);
    } else {
      setPendingSameCityTempApply({ armed: true, sawLoadingStart: false, productIds: plannedProductIdsForSwitch });
    }
  }, [loadWorkflow, tripPickup, tripWaitingPickup, tripStoreHook, plannedProductIdsForSwitch, setProductApi, effectiveUserId, equipment.selectedComboId]);

  // "Yes, Update My Card at {prev}" -- the driver did get carded in at the
  // terminal they're leaving, so renew that terminal's access date, then
  // apply the exact same switch-to-{next} steps the "No" option below does.
  // Never reverts location back to the previous terminal -- see this file's
  // own comment above (and TerminalSwitchDuringLoadSheet's header comment)
  // for why that was wrong: a driver answering this "yes" was reasonably
  // confirming a card update, not asking to cancel the switch, and
  // reverting it read as the app refusing to let them leave.
  const handleUpdateCardAtPrevious = useCallback(() => {
    if (!terminalSwitchConfirm) return;
    const { prev, next } = terminalSwitchConfirm;
    setTerminalSwitchConfirm(null);
    (async () => {
      try {
        await terminals.setAccessDateForTerminal(prev.terminalId, new Date().toISOString());
        await terminals.refreshTerminalAccessForUser();
      } catch (err) {
        console.warn("handleUpdateCardAtPrevious: access-date refresh failed (non-fatal):", err);
      }
    })();
    applyTerminalSwitch(prev, next);
  }, [terminalSwitchConfirm, terminals, applyTerminalSwitch]);

  // "No, Don't Update" -- leave for {next} without touching {prev}'s access
  // card at all. That's the whole point of "No Card Update."
  const handleSwitchWithoutUpdating = useCallback(() => {
    if (!terminalSwitchConfirm) return;
    const { prev, next } = terminalSwitchConfirm;
    setTerminalSwitchConfirm(null);
    applyTerminalSwitch(prev, next);
  }, [terminalSwitchConfirm, applyTerminalSwitch]);

  const handleCouldntLoad = useCallback(() => {
    setCouldntLoad({
      stage: "reason",
      prev: {
        terminalId: String(location.selectedTerminalId || ""), terminalName: terminalLabel || "Terminal",
        rackId: String(location.selectedRackId || ""), city: location.selectedCity, state: location.selectedState,
      },
    });
  }, [location.selectedTerminalId, location.selectedRackId, location.selectedCity, location.selectedState, terminalLabel]);
  // The why is answered (a reported issue or a picked reason): open the terminal picker.
  const onCouldntLoadReasonDone = useCallback(() => {
    if (couldntLoad?.stage !== "reason") return;
    setTerminalSwitchWatch(couldntLoad.prev);
    setCouldntLoad({ stage: "pick", prev: couldntLoad.prev });
    shell.setTermOpen(true);
  }, [couldntLoad, shell]);
  useEffect(() => {
    if (couldntLoad?.stage !== "apply") return;
    const hopped = !!(loadWorkflow.activeLoadId ? tripPickup : (tripWaitingPickup?.arrived_at ? tripWaitingPickup : null));
    applyTerminalSwitch(couldntLoad.prev, couldntLoad.next);
    setCouldntLoad({ stage: "supplier", hopped });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couldntLoad]);
  const finishCouldntLoad = useCallback(() => setCouldntLoad(null), []);

  // Trip workflow, no load in progress: the driver changed terminals from the
  // Planner's own picker. Leaving a rack they already arrived at is a rack
  // hop (same sheet as Plan Review: why, card, then the new terminal becomes
  // the next pickup). Before arriving, the pickup just follows the pick.
  // Armed only when the driver opens the picker (so the Planner restoring
  // its last terminal on load never counts as a switch).
  const plannerPickFromRef = useRef<string | null>(null);
  useEffect(() => {
    if (shell.termOpen || shell.locOpen || shell.rackPickerOpen || shell.rackResolving) {
      if (plannerPickFromRef.current == null) plannerPickFromRef.current = String(location.selectedTerminalId || "");
      return;
    }
    const prev = plannerPickFromRef.current;
    plannerPickFromRef.current = null;
    const cur = String(location.selectedTerminalId || "");
    if (!prev || !cur || prev === cur) return;
    if (loadWorkflow.activeLoadId || terminalSwitchWatch || terminalSwitchConfirm) return;
    const p = tripWaitingPickup;
    if (!p || !effectiveUserId || (p.terminal_id && p.terminal_id !== prev)) return;
    const next: TerminalSnapshot = {
      terminalId: cur, terminalName: terminalLabel || "Terminal",
      rackId: String(location.selectedRackId || ""),
      city: location.selectedCity, state: location.selectedState,
    };
    if (p.arrived_at) {
      setTerminalSwitchConfirm({
        prev: { terminalId: prev, terminalName: p.name || "the last terminal", rackId: p.rack_id ?? "", city: p.city ?? "", state: p.state ?? "" },
        next,
      });
      return;
    }
    try {
      if (retargetWaitingPickup(getTripStore(effectiveUserId), p.pickup_id, {
        terminalId: next.terminalId || null, rackId: next.rackId || null,
        name: next.terminalName, city: next.city, state: next.state,
      })) void tripStoreHook.syncNow();
    } catch (e) {
      console.warn("[trips] retarget pickup failed (non-fatal):", e);
    }
  }, [shell.termOpen, shell.locOpen, shell.rackPickerOpen, shell.rackResolving, location.selectedTerminalId, location.selectedRackId, location.selectedCity, location.selectedState, terminalLabel, loadWorkflow.activeLoadId, terminalSwitchWatch, terminalSwitchConfirm, tripWaitingPickup, effectiveUserId, tripStoreHook]);

  // Same-city silent refresh: waits for useFuelTempPrediction's own refetch
  // (already triggered automatically -- its signature includes terminalId,
  // see that hook) to complete a full cycle for the NEW terminal before
  // applying, rather than grabbing whatever predictedFuelTempF happens to
  // be the instant the switch is confirmed (which would usually still be
  // the OLD terminal's stale value, since the fetch is async). Watches
  // fuelTempLoading's own true->false transition instead of guessing at a
  // timeout.
  const [pendingSameCityTempApply, setPendingSameCityTempApply] = useState<{ armed: boolean; sawLoadingStart: boolean; productIds: string[] } | null>(null);
  useEffect(() => {
    if (!pendingSameCityTempApply) return;
    if (fuelTempLoading) {
      if (!pendingSameCityTempApply.sawLoadingStart) {
        setPendingSameCityTempApply((p) => (p ? { ...p, sawLoadingStart: true } : p));
      }
      return;
    }
    if (!pendingSameCityTempApply.sawLoadingStart) return; // fetch hasn't even started yet
    const { productIds } = pendingSameCityTempApply;
    setPendingSameCityTempApply(null);
    if (predictedFuelTempF != null) {
      setTempF(predictedFuelTempF);
      for (const pid of productIds) setProductTemp(pid, predictedFuelTempF);
    }
  }, [pendingSameCityTempApply, fuelTempLoading, predictedFuelTempF, setProductTemp]);

  // Different-city reconfirm: reopens the SAME ProductTempModal instance
  // the initial LOAD flow uses, but with a different onConfirm (see that
  // modal's render site below) -- this one never begins a new load, it
  // just propagates the driver-confirmed tempF into every planned
  // product's own tempF field (mirroring beginLoadToSupabase's own "Init
  // per-product inputs" seeding) and returns to the still-open Plan Review.
  const [tempReconfirmProductIds, setTempReconfirmProductIds] = useState<string[] | null>(null);
  const handleConfirmTempReconfirm = useCallback(() => {
    const pids = tempReconfirmProductIds ?? [];
    setTempReconfirmProductIds(null);
    setTempDialOpen(false);
    for (const pid of pids) setProductTemp(pid, tempF);
  }, [tempReconfirmProductIds, tempF, setProductTemp]);

  // Terminal-switch's own "Report Terminal Issue" is about the terminal the
  // driver was already loading at (prev), not the live selection (which by
  // this point is `next`) -- see handleSubmitOutageReport's own override
  // params.
  const handleSubmitOutageReportForPreviousTerminal = useCallback(
    (reportType: OutageReportType, productIds: string[]) => {
      const prev = (couldntLoad && "prev" in couldntLoad ? couldntLoad.prev : null) ?? terminalSwitchConfirm?.prev;
      return handleSubmitOutageReport(reportType, productIds, prev?.terminalId, prev?.rackId || null).then((r) => {
        if (!r.error && !switchReportedIssueRef.current) switchReportedIssueRef.current = reportType;
        return r;
      });
    },
    [terminalSwitchConfirm, couldntLoad, handleSubmitOutageReport]
  );

  return {
    terminalSwitchConfirm,
    couldntLoad, handleCouldntLoad, onCouldntLoadReasonDone, finishCouldntLoad,
    handleTapTerminalInLoadingModal,
    handleUpdateCardAtPrevious,
    handleSwitchWithoutUpdating,
    handleSubmitOutageReportForPreviousTerminal,
    tempReconfirmProductIds,
    setTempReconfirmProductIds,
    handleConfirmTempReconfirm,
    switchReportedIssueRef,
    switchReasonNoteRef,
  };
}
