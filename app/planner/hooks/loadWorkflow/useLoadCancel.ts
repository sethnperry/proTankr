"use client";
// app/planner/hooks/loadWorkflow/useLoadCancel.ts
//
// Cancelling a planned load.

import { useCallback, useState } from "react";
import { cancelPlannedLoad } from "@/lib/supabase/load";
import { clearActivePlannedLoad } from "../../utils/activePlannedLoad";
import { getTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import { unlinkCancelledLoad } from "@/lib/trips/tripLogic";

import type { Props } from "./types";

import type { useLoadWorkflowState } from "./useLoadWorkflowState";
import type { useLoadStart } from "./useLoadStart";

export function useLoadCancel(props: Props, k: ReturnType<typeof useLoadWorkflowState>, b: ReturnType<typeof useLoadStart>) {
  const { authUserId, activeLoadId, setActiveLoadId, setLoadingOpen } = k;
  // ── Cancel (Loading modal closed before LOADED is tapped) ─────────────────
  // begin_load inserts the load_log row immediately (needed so terminal_access
  // gets re-carded and the modal has a load_id to write into), so closing out
  // without completing must delete that row again -- otherwise every LOAD tap
  // that doesn't end in LOADED leaves a permanent blank "planned" row in My
  // Loads (the bug this fixes).
  const [cancelBusy, setCancelBusy] = useState(false);

  const cancelActiveLoad = useCallback(async () => {
    const loadId = activeLoadId;
    setLoadingOpen(false);
    // Whichever exit this is (Update Card / Back to Planner), the load is no
    // longer in progress -- a reopen should not resume it. See activePlannedLoad.
    clearActivePlannedLoad(authUserId);
    if (!loadId) return;
    setActiveLoadId(null);
    // Trip workflow: the trip goes back to "not loaded yet", never deleted.
    if (authUserId) {
      try {
        unlinkCancelledLoad(getTripStore(authUserId), { userId: authUserId, loadId, now: new Date(), newId: newTripId });
      } catch (e) {
        console.warn("[trips] unlink cancelled load failed (non-fatal):", e);
      }
    }
    setCancelBusy(true);
    try {
      // Server-enforced, atomic: cancel_planned_load deletes the row ONLY
      // while it is still "planned", under a row lock, so a completion that
      // raced this cancel (or whose response was lost to a network drop) can
      // never be destroyed -- it stays and shows in My Loads. This replaces
      // the old client-side read-status-then-delete, which had a TOCTOU gap
      // and put the decision on the client instead of the DB.
      const cancelled = await cancelPlannedLoad(loadId);
      if (!cancelled) {
        console.warn("cancelActiveLoad: load was not planned (kept); nothing cancelled.");
      }
    } catch (err) {
      console.warn("cancelActiveLoad: cancel_planned_load failed (non-fatal):", err);
    } finally {
      setCancelBusy(false);
    }
  }, [activeLoadId, authUserId]);

  return {
    cancelBusy,
    cancelActiveLoad,
  };
}
