"use client";
// app/planner/modals/decouple/useDecouple.ts
//
// State and handlers for the Decouple dialog: scenario, locations, statuses, validation, submit.

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

import type { Scenario, Step, Props } from "./types";
import { useGeoTag } from "./helpers";

export function useDecouple(props: Props) {
  const {
  open, onClose, comboId, truckId, trailerId, truckName, trailerName,
  companyId, uncoupledTrucks, uncoupledTrailers, onDecoupled,
} = props;

  const [step,     setStep]     = useState<Step>("scenario");
  const [scenario, setScenario] = useState<Scenario>(null);
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState<string | null>(null);
  const [reviewAttempted, setReviewAttempted] = useState(false);

  // Shared location (used by park_both)
  const [sharedLocation, setSharedLocation] = useState("");
  const [sharedLat,      setSharedLat]      = useState<number | null>(null);
  const [sharedLon,      setSharedLon]      = useState<number | null>(null);

  // Truck fields
  const [truckStatus,   setTruckStatus]   = useState("readyline");
  const [truckLocation, setTruckLocation] = useState("");
  const [truckLat,      setTruckLat]      = useState<number | null>(null);
  const [truckLon,      setTruckLon]      = useState<number | null>(null);
  const [truckNotes,    setTruckNotes]    = useState("");

  // Trailer fields
  const [trailerStatus,   setTrailerStatus]   = useState("readyline");
  const [trailerLocation, setTrailerLocation] = useState("");
  const [trailerLat,      setTrailerLat]      = useState<number | null>(null);
  const [trailerLon,      setTrailerLon]      = useState<number | null>(null);
  const [trailerNotes,    setTrailerNotes]    = useState("");

  // New unit pickers (for swap scenarios)
  const [newTruckId,   setNewTruckId]   = useState("");
  const [newTrailerId, setNewTrailerId] = useState("");

  function reset() {
    setStep("scenario"); setScenario(null); setBusy(false); setErr(null);
    setReviewAttempted(false);
    setNeedsTare(false); setNewTareLbs("");
    setSharedLocation(""); setSharedLat(null); setSharedLon(null);
    setTruckStatus("readyline"); setTruckLocation(""); setTruckLat(null); setTruckLon(null); setTruckNotes("");
    setTrailerStatus("readyline"); setTrailerLocation(""); setTrailerLat(null); setTrailerLon(null); setTrailerNotes("");
    setNewTruckId(""); setNewTrailerId("");
  }

  function handleClose() { reset(); onClose(); }

  function pickScenario(s: Scenario) {
    setScenario(s);
    setReviewAttempted(false);
    if (s === "drop_trailer") { setTrailerStatus("readyline"); setTruckStatus("in_use"); }
    if (s === "swap_truck")   { setTruckStatus("readyline"); setTrailerStatus("readyline"); }
    if (s === "swap_trailer") { setTrailerStatus("readyline"); setTruckStatus("readyline"); }
    if (s === "park_both")    { setTruckStatus("readyline"); setTrailerStatus("readyline"); }
    setStep("details");
  }

  // ── Geo hooks per field ──
  const truckGeo = useGeoTag((loc, lat, lon) => { setTruckLocation(loc); setTruckLat(lat); setTruckLon(lon); });
  const trailerGeo = useGeoTag((loc, lat, lon) => { setTrailerLocation(loc); setTrailerLat(lat); setTrailerLon(lon); });
  const sharedGeo = useGeoTag((loc, lat, lon) => { setSharedLocation(loc); setSharedLat(lat); setSharedLon(lon); });

  // ── Validation per scenario ──
  function canProceed(): boolean {
    switch (scenario) {
      case "drop_trailer":  return trailerLocation.trim().length > 0;
      case "swap_truck":    return truckLocation.trim().length > 0 && newTruckId.length > 0;
      case "swap_trailer":  return trailerLocation.trim().length > 0 && newTrailerId.length > 0;
      case "park_both":     return sharedLocation.trim().length > 0;
      default: return false;
    }
  }

  // ── Submit ──
  const [needsTare,  setNeedsTare]  = useState(false);
  const [newTareLbs, setNewTareLbs] = useState("");

  async function handleConfirm() {
    if (busy) return;
    setErr(null); setBusy(true);
    try {
      // On tare retry, decouple already happened — skip straight to recouple
      if (!needsTare) {
        const finalTruckStatus   = scenario === "drop_trailer" ? "in_use" : truckStatus;
        const finalTrailerStatus = trailerStatus;
        const finalTruckLoc   = scenario === "park_both" ? sharedLocation : truckLocation;
        const finalTruckLat   = scenario === "park_both" ? sharedLat : truckLat;
        const finalTruckLon   = scenario === "park_both" ? sharedLon : truckLon;
        const finalTrailerLoc = scenario === "park_both" ? sharedLocation : trailerLocation;
        const finalTrailerLat = scenario === "park_both" ? sharedLat : trailerLat;
        const finalTrailerLon = scenario === "park_both" ? sharedLon : trailerLon;

        const { error } = await supabase.rpc("decouple_combo", {
          p_combo_id:         comboId,
          p_scenario:         scenario!,
          p_truck_status:     finalTruckStatus,
          p_truck_location:   finalTruckLoc.trim() || null,
          p_truck_lat:        finalTruckLat,
          p_truck_lon:        finalTruckLon,
          p_truck_notes:      truckNotes.trim() || null,
          p_trailer_status:   finalTrailerStatus,
          p_trailer_location: finalTrailerLoc.trim() || null,
          p_trailer_lat:      finalTrailerLat,
          p_trailer_lon:      finalTrailerLon,
          p_trailer_notes:    trailerNotes.trim() || null,
        });
        if (error) throw error;

        // Write status/location directly — decouple_combo RPC doesn't update truck/trailer rows
        await Promise.all([
          supabase.from("trucks").update({
            status_code:     finalTruckStatus,
            status_location: finalTruckLoc.trim() || null,
          }).eq("truck_id", truckId).eq("company_id", companyId),
          supabase.from("trailers").update({
            status_code:     finalTrailerStatus,
            status_location: finalTrailerLoc.trim() || null,
          }).eq("trailer_id", trailerId).eq("company_id", companyId),
        ]);
      }

      // For swap scenarios, recouple with the new unit (runs on first attempt and tare retry)
      let newComboId: string | undefined;

      if (scenario === "swap_truck" && newTruckId) {
        const tare = newTareLbs ? Number(newTareLbs) : undefined;
        if (needsTare) {
          if (!tare || !Number.isFinite(tare) || tare <= 0) {
            throw new Error("Enter a valid tare weight to continue.");
          }
        }
        const params: Record<string, any> = { p_truck_id: newTruckId, p_trailer_id: trailerId };
        if (tare && tare > 0) params.p_tare_lbs = tare;
        const { data: coupleData, error: coupleErr } = await supabase.rpc("couple_combo", params);
        if (coupleErr) {
          if (coupleErr.message?.toLowerCase().includes("tare") || coupleErr.message?.toLowerCase().includes("historical") || coupleErr.message?.toLowerCase().includes("provide")) {
            setNeedsTare(true);
            throw new Error("This is a new truck/trailer pairing. Enter the tare weight from a certified scale ticket.");
          }
          throw coupleErr;
        }
        newComboId = String((coupleData as any)?.combo_id ?? "");
        // Auto-claim the new combo so it's selected in the planner
        if (newComboId) {
          await supabase.rpc("claim_combo", { p_combo_id: newComboId });
        }
      }

      if (scenario === "swap_trailer" && newTrailerId) {
        const tare = newTareLbs ? Number(newTareLbs) : undefined;
        if (needsTare) {
          if (!tare || !Number.isFinite(tare) || tare <= 0) {
            throw new Error("Enter a valid tare weight to continue.");
          }
        }
        const params: Record<string, any> = { p_truck_id: truckId, p_trailer_id: newTrailerId };
        if (tare && tare > 0) params.p_tare_lbs = tare;
        const { data: coupleData, error: coupleErr } = await supabase.rpc("couple_combo", params);
        if (coupleErr) {
          if (coupleErr.message?.toLowerCase().includes("tare") || coupleErr.message?.toLowerCase().includes("historical") || coupleErr.message?.toLowerCase().includes("provide")) {
            setNeedsTare(true);
            throw new Error("This is a new truck/trailer pairing. Enter the tare weight from a certified scale ticket.");
          }
          throw coupleErr;
        }
        newComboId = String((coupleData as any)?.combo_id ?? "");
        // Auto-claim the new combo so it's selected in the planner
        if (newComboId) {
          await supabase.rpc("claim_combo", { p_combo_id: newComboId });
        }
      }

      onDecoupled(newComboId);
      reset();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to decouple.");
    } finally {
      setBusy(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── STEP: SCENARIO ────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────────────────────
  // ── STEP: DETAILS — branches per scenario ────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const scenarioColors: Record<NonNullable<Scenario>, string> = {
    swap_truck:    "#fbbf24",
    swap_trailer:  "#a78bfa",
    drop_trailer:  "#67e8f9",
    park_both:     "#86efac",
  };
  const scenarioLabels: Record<NonNullable<Scenario>, string> = {
    swap_truck:   "🔄 Swap the truck",
    swap_trailer: "🔁 Swap the trailer",
    drop_trailer: "🚚 Drop the trailer",
    park_both:    "🅿️ Park both units",
  };


  // ─────────────────────────────────────────────────────────────────────────
  // ── STEP: CONFIRM ─────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  const truckWarn   = truckStatus === "deadline";
  const trailerWarn = trailerStatus === "deadline";

  const newTruckName   = uncoupledTrucks.find(t => t.id === newTruckId)?.name ?? "";
  const newTrailerName = uncoupledTrailers.find(t => t.id === newTrailerId)?.name ?? "";

  return {
    open,
    onClose,
    truckName,
    trailerName,
    uncoupledTrucks,
    uncoupledTrailers,
    step,
    setStep,
    scenario,
    busy,
    err,
    setErr,
    reviewAttempted,
    setReviewAttempted,
    sharedLocation,
    setSharedLocation,
    truckStatus,
    setTruckStatus,
    truckLocation,
    setTruckLocation,
    truckNotes,
    setTruckNotes,
    trailerStatus,
    setTrailerStatus,
    trailerLocation,
    setTrailerLocation,
    trailerNotes,
    setTrailerNotes,
    newTruckId,
    setNewTruckId,
    newTrailerId,
    setNewTrailerId,
    handleClose,
    pickScenario,
    truckGeo,
    trailerGeo,
    sharedGeo,
    canProceed,
    needsTare,
    newTareLbs,
    setNewTareLbs,
    handleConfirm,
    scenarioColors,
    scenarioLabels,
    truckWarn,
    trailerWarn,
    newTruckName,
    newTrailerName,
  };
}

export type DecoupleModel = ReturnType<typeof useDecouple>;
