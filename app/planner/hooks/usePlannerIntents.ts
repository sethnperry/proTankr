"use client";
// app/planner/hooks/usePlannerIntents.ts
//
// Requests from other screens that the Planner acts on: "begin loading" (open
// Plan Review over the dashboard once the plan is ready) and "open this load's
// report", from the shell's intent queue and from the older ?begin= link. Also
// tells the screen underneath when Plan Review or a report is up. Lifted out of
// PlannerHost unchanged.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { getTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import type { TripPickupRow, TripRow } from "@/lib/trips/types";
import { openTripForDriver, unlinkCancelledLoad } from "@/lib/trips/tripLogic";
import { cancelPlannedLoad } from "@/lib/supabase/load";
import { clearActivePlannedLoad } from "../utils/activePlannedLoad";

import type { useCalculatorShell } from "../CalculatorShellContext";
import type { useLoadWorkflow } from "./useLoadWorkflow";
import type { usePlanSlots } from "./usePlanSlots";
import type { useTripStore } from "@/lib/trips/useTripStore";

type Inputs = {
  effectiveUserId: string | null | undefined;
  loadDisabled: boolean;
  loadWorkflow: ReturnType<typeof useLoadWorkflow>;
  openLoadReportAtTerminal: (loadId?: string) => Promise<void>;
  planSlots: ReturnType<typeof usePlanSlots>;
  plannedProductIds: Set<string>;
  requestBegin: (override: Record<string, number>) => void;
  shell: ReturnType<typeof useCalculatorShell>;
  tripNeedsArrive: boolean;
  tripStoreHook: ReturnType<typeof useTripStore>;
  unavailableComps: unknown[];
};

export function usePlannerIntents(i: Inputs) {
  const { effectiveUserId, loadDisabled, loadWorkflow, openLoadReportAtTerminal, planSlots, plannedProductIds, requestBegin, shell, tripNeedsArrive, tripStoreHook, unavailableComps } = i;
  const router = useRouter();
  // Begin Loading / Continue Trip from the dashboard: when a plan is already in
  // place, open Plan Review right over the dashboard (what BEGIN LOADING would
  // do). With no plan, or if it can't start, go to the Planner so the driver
  // can see why. Waits for presets/equipment and gives up after 8 s.
  const beginReadyRef = useRef({ go: false, plan: false, empty: false });
  beginReadyRef.current = {
    go: !loadDisabled && !tripNeedsArrive && !loadWorkflow.activeLoadId && unavailableComps.length === 0 && planSlots.presetsReady,
    plan: plannedProductIds.size > 0,
    // presets are in, nothing is planned, and nothing else is pending: no
    // plan to review, so don't wait for "go" (which can never become true)
    empty: planSlots.presetsReady && plannedProductIds.size === 0 && !tripNeedsArrive && !loadWorkflow.activeLoadId,
  };
  const beginTickRef = useRef<number | null>(null);
  const startBeginWatch = useCallback(() => {
    if (beginTickRef.current != null) window.clearInterval(beginTickRef.current);
    const started = Date.now();
    const finish = (open: boolean) => {
      if (beginTickRef.current != null) window.clearInterval(beginTickRef.current);
      beginTickRef.current = null;
      if (open) requestBegin({});
      else if (window.location.pathname !== "/planner") router.push("/planner?plan=1");
    };
    beginTickRef.current = window.setInterval(() => {
      const r = beginReadyRef.current;
      if (r.go) {
        // give a just-applied trip plan a moment to land before deciding
        if (!r.plan && Date.now() - started < 1500) return;
        finish(r.plan);
      } else if (r.empty && Date.now() - started > 1500) {
        finish(false);
      } else if (Date.now() - started > 8000) {
        finish(false);
      }
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, shell.setLoadOverlayOpen]);
  useEffect(() => () => { if (beginTickRef.current != null) window.clearInterval(beginTickRef.current); }, []);

  // Requests from other screens (shell.postPlannerIntent) and, for a hard
  // load, the old ?begin=1 / ?report= links.
  const intent = shell.plannerIntent;
  useEffect(() => {
    if (!intent) return;
    shell.consumePlannerIntent(intent.id);
    if (intent.kind === "begin") {
      void (async () => {
        // Plan Review is already running (the host stays mounted): just show it.
        if (loadWorkflow.activeLoadId) { loadWorkflow.setLoadingOpen(true); return; }
        // After a full reload the started load is gone from memory but the
        // pickup still points at it: finished -> its report, else release it
        // so Plan Review can start again on the same pickup.
        const rows = tripStoreHook.state.rows;
        const trip = effectiveUserId ? openTripForDriver(Object.values(rows.trips ?? {}) as TripRow[], effectiveUserId) : null;
        const comps = Object.values(rows.trip_compartment_loads ?? {}) as { pickup_id: string; disposition: string }[];
        const stale = trip
          ? (Object.values(rows.trip_pickups ?? {}) as TripPickupRow[]).find((p) =>
              p.trip_id === trip.trip_id && p.load_id && !p.left_at && !comps.some((c) => c.pickup_id === p.pickup_id && c.disposition !== "cancelled"))
          : null;
        if (stale?.load_id && effectiveUserId) {
          let status: string | null = null;
          try {
            const { data } = await supabase.from("load_log").select("status").eq("load_id", stale.load_id).maybeSingle();
            status = (data as { status?: string } | null)?.status ?? null;
          } catch { /* offline: treat as still planned */ }
          if (status === "loaded" || status === "completed") { void openLoadReportAtTerminal(stale.load_id); return; }
          try { await cancelPlannedLoad(stale.load_id); } catch (e) { console.warn("[trips] release planned load failed (non-fatal):", e); }
          clearActivePlannedLoad(effectiveUserId);
          unlinkCancelledLoad(getTripStore(effectiveUserId), { userId: effectiveUserId, loadId: stale.load_id, now: new Date(), newId: newTripId });
        }
        startBeginWatch();
      })();
    } else if (intent.kind === "report" && intent.loadId) {
      void openLoadReportAtTerminal(intent.loadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.id]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("begin")) return;
    params.delete("begin");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    startBeginWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Tells the screen underneath that Plan Review / a report is up.
  const overlayUp = !!(loadWorkflow.loadingOpen || loadWorkflow.reportLines);
  useEffect(() => { shell.setLoadOverlayOpen(overlayUp); }, [overlayUp]); // eslint-disable-line react-hooks/exhaustive-deps
}
