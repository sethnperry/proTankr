"use client";
// app/planner/modals/solo/useSoloData.ts
//
// Data: loading rows, service and wash lines, home region, and the effects that keep them current.

import type { UnitLastService } from "./serviceInfo";
import type { TruckRow, TrailerRow, ComboRow, UnitServiceDue } from "./types";
import { computeUnitServiceDue, mostRecentServiceForUnit, computeWashLines } from "./serviceInfo";
import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { type ServiceType } from "../ServiceTypeManager";
import type { Props } from "./types";

import type { useSoloState } from "./useSoloState";

export function useSoloData(props: Props, s: ReturnType<typeof useSoloState>) {
  const {
    open,
    authUserId,
    companyId,
    selectedComboId,
    setupSession,
    currentTruckId,
    currentTrailerId,
    canAddRemove,
    trucks,
    setTrucks,
    trailers,
    setTrailers,
    combos,
    setCombos,
    loading,
    setLoading,
    setError,
    selectedTruckId,
    setSelectedTruckId,
    selectedTrailerId,
    setSelectedTrailerId,
    setServiceTypes,
    setServiceLines,
    setTrailerServiceLine,
    setWashLines,
    setFilter,
    setAddTruckOpen,
    setAddTrailerOpen,
    setDriverHomeRegion,
    setClaimedByNames,
  } = s;
  const loadEquipment = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: t, error: tErr }, { data: tr, error: trErr }, { data: c, error: cErr }] = await Promise.all([
      supabase
        .from("trucks")
        .select(
          "truck_id, truck_name, active, region, local_area, current_region, current_local_area, status_code, status_notes, sub_status",
        )
        .eq("company_id", companyId)
        .eq("active", true)
        .order("truck_name"),
      supabase
        .from("trailers")
        .select(
          "trailer_id, trailer_name, active, region, local_area, current_region, current_local_area, status_code, status_notes, sub_status",
        )
        .eq("company_id", companyId)
        .eq("active", true)
        .order("trailer_name"),
      supabase
        .from("equipment_combos")
        .select("combo_id, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by")
        .eq("company_id", companyId)
        .eq("active", true),
    ]);
    if (tErr || trErr || cErr) {
      setError(tErr?.message ?? trErr?.message ?? cErr?.message ?? "Failed to load equipment.");
    }
    setTrucks((t ?? []) as TruckRow[]);
    setTrailers((tr ?? []) as TrailerRow[]);
    const comboRows = (c ?? []) as ComboRow[];
    setCombos(comboRows);

    // Resolve display names for anyone ELSE currently holding a combo --
    // needed to name them in the "commandeer this unit from X" warning.
    const otherClaimerIds = Array.from(new Set(comboRows.map((r) => r.claimed_by).filter((id): id is string => !!id && id !== authUserId)));
    if (otherClaimerIds.length > 0) {
      const { data: nameRows } = await supabase.rpc("get_display_names_full", { p_user_ids: otherClaimerIds });
      const map: Record<string, string> = {};
      for (const row of (nameRows ?? []) as any[]) {
        if (row.user_id) map[row.user_id] = row.display_name ?? "another driver";
      }
      setClaimedByNames(map);
    } else {
      setClaimedByNames({});
    }

    setLoading(false);
  }, [companyId, authUserId]);

  const loadServiceTypes = useCallback(async () => {
    const { data } = await supabase
      .from("service_types")
      .select("service_type_id, name, interval_kind, interval_value, applies_to, is_active")
      .eq("company_id", companyId)
      .order("name");
    const fresh = (data ?? []) as ServiceType[];
    setServiceTypes(fresh);
    return fresh;
  }, [companyId]);

  // Fetches service_types fresh on every call rather than reading the
  // `serviceTypes` state var. A caller that just created a new type (Service
  // modal's "+ New type" flow) calls onTypesChanged() then onSaved() back to
  // back -- onTypesChanged's setServiceTypes() hasn't committed by the time
  // onSaved's closure (captured at the last render) runs, so reading state
  // here would silently show "No service recorded" right after a successful
  // save. A fresh, uncached fetch sidesteps the staleness entirely.
  const loadServiceAndWash = useCallback(
    async (truckId: string | null, trailerId: string | null) => {
      if (!truckId && !trailerId) {
        setServiceLines([]);
        setTrailerServiceLine(null);
        setWashLines([]);
        return;
      }

      const { data: typesData } = await supabase
        .from("service_types")
        .select("service_type_id, name, interval_kind, interval_value, applies_to, is_active")
        .eq("company_id", companyId);
      const types = (typesData ?? []) as ServiceType[];

      const serviceResults: UnitServiceDue[] = [];
      let trailerLine: UnitLastService | null = null;
      let truckWashedAt: string | null = null;
      let trailerWashedAt: string | null = null;

      if (truckId) {
        const [{ data: records }, { data: washes }] = await Promise.all([
          supabase.from("service_records").select("service_type_id, date, reading_value, created_at").eq("truck_id", truckId),
          supabase.from("wash_records").select("washed_at").eq("truck_id", truckId).order("washed_at", { ascending: false }).limit(1),
        ]);
        serviceResults.push(computeUnitServiceDue("Truck", (records ?? []) as any, types));
        truckWashedAt = (washes ?? [])[0]?.washed_at ?? null;
      }
      if (trailerId) {
        // Trailer's own report line -- brought back per explicit follow-up
        // ("we want to add the trailer report line under the truck again").
        // Backward-looking (last serviced), not the truck's forward-looking
        // "next due" -- see mostRecentServiceForUnit's own header comment.
        const [{ data: records }, { data: washes }] = await Promise.all([
          supabase.from("service_records").select("service_type_id, date, reading_value, created_at").eq("trailer_id", trailerId),
          supabase.from("wash_records").select("washed_at").eq("trailer_id", trailerId).order("washed_at", { ascending: false }).limit(1),
        ]);
        trailerLine = mostRecentServiceForUnit("Trailer", (records ?? []) as any, types);
        trailerWashedAt = (washes ?? [])[0]?.washed_at ?? null;
      }

      setServiceLines(serviceResults);
      setTrailerServiceLine(trailerLine);
      setWashLines(computeWashLines(truckWashedAt, trailerWashedAt));
    },
    [companyId],
  );

  useEffect(() => {
    if (!open) return;
    loadEquipment();
    loadServiceTypes();
  }, [open, loadEquipment, loadServiceTypes]);

  // Default the Region filter to the driver's own region on open — "change
  // the filter to see MORE, not less." Fleet onboarding makes region a
  // required field; solo drivers usually have none set, so this no-ops for
  // them. Only applied when the driver's region actually matches some
  // equipment, so a stale/typo region can never present an empty grid. Runs
  // once per open (the parent unmounts this modal when closed, so filter
  // state resets to {null,null} each time it reopens).
  const regionDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      regionDefaultAppliedRef.current = false;
      setDriverHomeRegion(null);
    }
  }, [open]);
  useEffect(() => {
    if (!open || loading || regionDefaultAppliedRef.current) return;
    regionDefaultAppliedRef.current = true;
    const uid = setupSession?.targetUserId ?? authUserId;
    if (!uid) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("region").eq("user_id", uid).maybeSingle();
      const region = String((data as any)?.region ?? "").trim();
      if (!region) return;
      // Stored regardless of whether it matches any equipment yet -- the
      // away-from-home coupling warning (toggleTruck/toggleTrailer) needs
      // this even when the driver's own filter never got auto-narrowed.
      setDriverHomeRegion(region);
      const hasMatch = trucks.some((t) => t.region === region) || trailers.some((t) => t.region === region);
      if (hasMatch) setFilter((f) => ({ ...f, region }));
    })();
  }, [open, loading, authUserId, setupSession, trucks, trailers]);

  // Initialize local truck/trailer selection from the current combo, or -- when
  // there's no full combo -- from the bobtail/trailer-only current_* units, so
  // a partial selection shows as selected on reopen.
  useEffect(() => {
    if (!open || loading) return;
    const current = combos.find((c) => String(c.combo_id) === String(selectedComboId));
    if (current) {
      setSelectedTruckId(current.truck_id ?? null);
      setSelectedTrailerId(current.trailer_id ?? null);
    } else {
      setSelectedTruckId(currentTruckId ?? null);
      setSelectedTrailerId(currentTrailerId ?? null);
    }
  }, [open, loading, selectedComboId, combos, currentTruckId, currentTrailerId]);

  useEffect(() => {
    if (!open) return;
    void loadServiceAndWash(selectedTruckId, selectedTrailerId);
  }, [open, selectedTruckId, selectedTrailerId, loadServiceAndWash]);

  // ── Onboarding: default straight into Add Truck -> Add Trailer when
  // nothing is on file yet ──────────────────────────────────────────────
  // Per explicit spec: "If there are no equipment user must add a Truck.
  // After a truck has been added, it gets selected and a trailer is
  // required. Then it is automatically selected and the requirements move
  // on to location." This nudges the driver straight into the Add flow
  // instead of an empty grid with just a "+" -- it's not a literal trap
  // (canceling out of Add Truck just leaves the empty grid+"+" showing,
  // since the effect's own deps below don't change from that alone, so it
  // won't immediately reopen), but SetupGate's own outer hard gate
  // (comboSelected) still refuses to let the driver past Equipment at all
  // until a real combo exists -- reopening this modal from there re-runs
  // this effect and nudges again. Fires for ANY zero-equipment state, not
  // just first-time signup, since that's the literal condition described
  // (no equipment on file), not "new company only."
  useEffect(() => {
    if (!open || loading) return;
    // A plain fleet driver can't add equipment, so don't nudge them into an
    // Add flow they can't complete — they select from the company pool
    // instead (or, with nothing on file yet, see the empty grid).
    if (!canAddRemove) return;
    if (trucks.length === 0) {
      setAddTruckOpen(true);
      return;
    }
    if (trailers.length === 0 && selectedTruckId) {
      setAddTrailerOpen(true);
    }
  }, [open, loading, trucks.length, trailers.length, selectedTruckId, canAddRemove]);

  // ── Actions ──────────────────────────────────────────────────────────────
  //
  // Resolving/creating the combo for a (truck, trailer) pair happens
  // imperatively, called directly from the tap handlers below -- NOT as a
  // reactive effect watching selectedTruckId/selectedTrailerId. An earlier
  // version did that reactively and it fed back into itself: resolving a
  // pair calls onSelectComboId -> parent re-renders with a new
  // selectedComboId -> the "sync local selection from external state" effect
  // above reacts to that -> which could re-trigger the resolve effect ->
  // React's "Maximum update depth exceeded" loop. Doing this in direct
  // response to the user's tap (a one-shot event, never re-invoked by a
  // render) removes the cycle entirely.

  return {
    loadEquipment,
    loadServiceTypes,
    loadServiceAndWash,
  };
}
