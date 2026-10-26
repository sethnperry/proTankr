"use client";
// app/planner/hooks/loadWorkflow/useLoadStart.ts
//
// Beginning a load: begin_load, plan snapshot, attaching to the open trip.

import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { beginLoad, deleteLoad } from "@/lib/supabase/load";
import { writeActivePlannedLoad } from "../../utils/activePlannedLoad";
import { getTripStore } from "@/lib/trips/useTripStore";
import { newId as newTripId } from "@/lib/trips/tripStore";
import { linkLoadToOpenTrip } from "@/lib/trips/tripLogic";

import type { Props } from "./types";
import { friendlyLoadError } from "./friendlyError";

import type { useLoadWorkflowState } from "./useLoadWorkflowState";

export function useLoadStart(props: Props, k: ReturnType<typeof useLoadWorkflowState>) {
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
    setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalAccess,
    activeSlotLetter,
    setActiveLoadId,
    beginLoadBusy,
    setBeginLoadBusy,
    setLoadingOpen,
    setLoadingModalError,
    setCompleteError,
    setLoadUtilization,
    PLAN_SNAPSHOT_VERSION,
  } = k;
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

      // Clean up any stale "planned" row left behind by a previous LOAD tap
      // for this same combo that never reached LOADED or Cancel (app
      // backgrounded/closed mid-session -- see CLAUDE.md "Pre-launch
      // cleanup: orphaned planned load_log rows"). Reuses the same
      // delete_load RPC the explicit Cancel path already calls, so this is
      // just making sure begin_load never accumulates more than one
      // abandoned planned row per combo going forward. Best-effort: a
      // failure here shouldn't block starting the new load.
      if (authUserId && selectedComboId) {
        try {
          const { data: stale } = await supabase
            .from("load_log")
            .select("load_id")
            .eq("user_id", authUserId)
            .eq("combo_id", selectedComboId)
            .eq("status", "planned");
          if (stale && stale.length > 0) {
            await Promise.all(stale.map((r: any) => deleteLoad(r.load_id).catch(() => {})));
          }
        } catch (err) {
          console.warn("stale planned-row cleanup failed (non-fatal):", err);
        }
      }

      const lines = (planRows as any[])
        .filter((r) => r.productId && Number(r.planned_gallons ?? 0) > 0)
        .map((r) => {
          const gallons = Number(r.planned_gallons ?? 0);
          const lbs = gallons * Number(r.lbsPerGal ?? 0);
          const prod = terminalProducts.find((p) => p.product_id === r.productId);
          // Capture API and its timestamp at plan time — last_api_updated_at gets
          // overwritten on load completion, so we must snapshot it now.
          const plannedApi = prod?.last_api != null ? Number(prod.last_api) : null;
          const plannedApiUpdatedAt = (prod as any)?.last_api_updated_at ?? null;
          return {
            comp_number: Number(r.comp_number),
            product_id: String(r.productId),
            product_name: prod?.product_name ?? prod?.display_name ?? null,
            button_code: (prod as any)?.button_code ?? null,
            un_number: (prod as any)?.un_number ?? null,
            planned_gallons: Number.isFinite(gallons) ? gallons : null,
            planned_lbs: Number.isFinite(lbs) ? lbs : null,
            temp_f: tempF ?? null,
            planned_api: Number.isFinite(plannedApi ?? NaN) ? plannedApi : null,
            planned_api_updated_at: plannedApiUpdatedAt,
          };
        });

      if (lines.length === 0) throw new Error("No filled compartments.");

      const planned_total_gal = Number.isFinite(plannedGallonsTotal) ? plannedGallonsTotal : null;
      const planned_total_lbs = Number.isFinite(plannedWeightLbs) ? plannedWeightLbs : null;
      const planned_gross_lbs = Number.isFinite(tare) && Number.isFinite(plannedWeightLbs) ? tare + plannedWeightLbs : null;

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

      // Trip workflow (phase 2): attach this load to the driver's open trip,
      // if they started one from the dashboard. Local write only (the trip
      // store syncs in the background); no open trip -> nothing happens.
      if (authUserId && result.load_id) {
        try {
          linkLoadToOpenTrip(getTripStore(authUserId), {
            userId: authUserId,
            loadId: result.load_id,
            pickup: { terminalId: selectedTerminalId || null, rackId: selectedRackId || null },
            now: new Date(),
            newId: newTripId,
          });
        } catch (e) {
          console.warn("[trips] link load to trip failed (non-fatal):", e);
        }
      }

      // Mark this as the driver's in-progress load so a reopen resumes its
      // plan + terminal instead of starting fresh (see activePlannedLoad).
      // Cleared on completion (below) and on cancel.
      writeActivePlannedLoad(authUserId, {
        loadId: result.load_id,
        comboId: String(selectedComboId),
        terminalId: String(selectedTerminalId || ""),
        rackId: selectedRackId ? String(selectedRackId) : null,
        state: String(selectedState || ""),
        city: String(selectedCity || ""),
      });

      // Rack-aware loading: tag which physical rack this load happened at
      // (see CLAUDE.md "rack-aware loading"). Plain UPDATE on the row just
      // created, same non-blocking pattern as plan_slot below -- a failure
      // here only means this load can't be attributed to a rack later,
      // never blocks the load itself. Skipped entirely for a 0/1-rack
      // terminal (selectedRackId is "" -- nothing to tag).
      if (selectedRackId && result.load_id) {
        supabase
          .from("load_log")
          .update({ rack_id: selectedRackId })
          .eq("load_id", result.load_id)
          .then(({ error }) => {
            if (error) console.error("[rack] failed to tag rack_id:", error.message);
          });
      }

      // Recap card label ("Plan A") -- plain UPDATE on the row just created,
      // same non-blocking pattern as rack_id above. Non-fatal: a failure
      // here only means the recap can't name a preset, never blocks the
      // load itself.
      if (activeSlotLetter && result.load_id) {
        supabase
          .from("load_log")
          .update({ plan_slot: activeSlotLetter })
          .eq("load_id", result.load_id)
          .then(({ error }) => {
            if (error) console.error("[recap] failed to tag plan_slot:", error.message);
          });
      }

      // Reset terminal access expiry — driver is actively loading, so re-card them now.
      // begin_load doesn't touch terminal_access, so we do it here.
      if (selectedTerminalId && authUserId) {
        (async () => {
          try {
            await supabase
              .from("terminal_access")
              .upsert(
                { user_id: authUserId, terminal_id: selectedTerminalId, carded_on: new Date().toISOString() },
                { onConflict: "user_id,terminal_id" },
              );

            await Promise.resolve(onRefreshTerminalAccess?.());
          } catch (err) {
            console.warn("terminal_access refresh failed (non-fatal):", err);
          }
        })();
      }

      // Init per-product inputs
      const nextInputs: Record<string, { api?: string; tempF?: number }> = {};
      for (const r of planRows as any[]) {
        const pid = r?.productId ? String(r.productId) : null;
        if (!pid || !Number.isFinite(Number(r?.planned_gallons ?? 0))) continue;
        if (!nextInputs[pid]) {
          // API is left empty here: Log the Load fills it from the plan's own
          // basis (page.tsx productInputsForModal), blank on a first load at a
          // terminal. Only a tune or the driver's entry writes it.
          nextInputs[pid] = { api: "", tempF: Number(tempF) };
        }
      }
      setProductInputs(nextInputs);
      setLoadUtilization(null);
      setLoadingGallonsOverride?.({});
      setLoadingOpen(true);
      setLoadingModalError(null);
      setCompleteError(null); // don't carry a prior load's error into a fresh one
    } catch (err: any) {
      console.error(err);
      // No Loading modal is open yet on a begin failure (this throws before
      // setLoadingOpen(true)), so an alert is the only channel here -- but a
      // readable one, not a raw "TypeError: Failed to fetch."
      alert(friendlyLoadError(err, "Failed to begin load."));
    } finally {
      setBeginLoadBusy(false);
    }
  }, [
    beginLoadBusy,
    selectedComboId,
    selectedTerminalId,
    selectedRackId,
    selectedState,
    selectedCity,
    selectedCityId,
    planRows,
    plannedGallonsTotal,
    plannedWeightLbs,
    tare,
    cgBias,
    ambientTempF,
    tempF,
    setProductInputs,
    setLoadingGallonsOverride,
    onRefreshTerminalAccess,
    authUserId,
    activeSlotLetter,
  ]);

  return {
    beginLoadToSupabase,
  };
}
