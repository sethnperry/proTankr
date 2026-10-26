"use client";
// app/planner/modals/solo/useSoloActions.ts
//
// Actions: add, edit, status, remove, new tare, close.

import type { TruckRow, TrailerRow } from "./types";
import { supabase } from "@/lib/supabase/client";
import type { Props } from "./types";

import type { useSoloState } from "./useSoloState";
import type { useSoloData } from "./useSoloData";
import type { useSoloCoupling } from "./useSoloCoupling";

export function useSoloActions(
  props: Props,
  s: ReturnType<typeof useSoloState>,
  d: ReturnType<typeof useSoloData>,
  c: ReturnType<typeof useSoloCoupling>,
) {
  const {
    onClose,
    companyId,
    selectedComboId,
    onRefreshCombos,
    currentTruckId,
    currentTrailerId,
    setCurrentEquipment,
    trucks,
    trailers,
    setError,
    setBusy,
    selectedTruckId,
    setSelectedTruckId,
    selectedTrailerId,
    setSelectedTrailerId,
    setBinderOpen,
    setBinderUnit,
    setEditPickerOpen,
    setStatusPickerOpen,
    setStatusTarget,
    setAddTruckOpen,
    setAddTrailerOpen,
    removeTarget,
    setRemoveTarget,
    newTareTarget,
    setNewTareTarget,
    newTareInput,
    setNewTareInput,
    commandeerTarget,
    setCommandeerTarget,
  } = s;
  const { loadEquipment } = d;
  const { resolvePair, toggleTruck, toggleTrailer } = c;
  async function handleTruckAdded() {
    const wasEmpty = trucks.length === 0;
    setAddTruckOpen(false);
    await loadEquipment();
    if (wasEmpty) {
      const { data } = await supabase
        .from("trucks")
        .select("truck_id")
        .eq("company_id", companyId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if ((data as any)?.truck_id) toggleTruck(String((data as any).truck_id));
    }
  }
  async function handleTrailerAdded() {
    const wasEmpty = trailers.length === 0;
    setAddTrailerOpen(false);
    await loadEquipment();
    if (wasEmpty) {
      const { data } = await supabase
        .from("trailers")
        .select("trailer_id")
        .eq("company_id", companyId)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      if ((data as any)?.trailer_id) toggleTrailer(String((data as any).trailer_id));
    }
  }

  // Edit (was "File") -- skip the unit picker entirely when only one unit
  // is currently selected (same "don't ask when there's nothing to choose
  // between" precedent as the outage-report product picker), otherwise
  // ask which unit. Neither selected falls through to Binder's own
  // existing "Select equipment first" empty state.
  function openEdit() {
    if (selectedTruckId && selectedTrailerId) {
      setEditPickerOpen(true);
      return;
    }
    setBinderUnit(selectedTruckId ? "truck" : selectedTrailerId ? "trailer" : null);
    setBinderOpen(true);
  }

  // Update Status (STUD) -- same "skip the picker when there's nothing to
  // choose between" precedent as Edit above.
  function openStatusFor(kind: "truck" | "trailer", id: string) {
    const t = kind === "truck" ? trucks.find((x) => x.truck_id === id) : trailers.find((x) => x.trailer_id === id);
    if (!t) return;
    setStatusTarget({
      kind,
      id,
      name: kind === "truck" ? (t as TruckRow).truck_name : (t as TrailerRow).trailer_name,
      status: t.status_code,
      notes: t.status_notes,
      subStatus: t.sub_status,
      homeLocalArea: t.local_area,
    });
  }
  function openStatusForTruck() {
    const t = trucks.find((x) => x.truck_id === selectedTruckId);
    if (!t) return;
    setStatusTarget({
      kind: "truck",
      id: t.truck_id,
      name: t.truck_name,
      status: t.status_code,
      notes: t.status_notes,
      subStatus: t.sub_status,
      homeLocalArea: t.local_area,
    });
  }
  function openStatusForTrailer() {
    const t = trailers.find((x) => x.trailer_id === selectedTrailerId);
    if (!t) return;
    setStatusTarget({
      kind: "trailer",
      id: t.trailer_id,
      name: t.trailer_name,
      status: t.status_code,
      notes: t.status_notes,
      subStatus: t.sub_status,
      homeLocalArea: t.local_area,
    });
  }
  function openStatus() {
    if (selectedTruckId && selectedTrailerId) {
      setStatusPickerOpen(true);
      return;
    }
    if (selectedTruckId) {
      openStatusForTruck();
      return;
    }
    if (selectedTrailerId) {
      openStatusForTrailer();
      return;
    }
  }

  function confirmCommandeer() {
    if (!commandeerTarget) return;
    const { kind, id } = commandeerTarget;
    setCommandeerTarget(null);
    if (kind === "truck") {
      setSelectedTruckId(id);
      void resolvePair(id, selectedTrailerId);
    } else {
      setSelectedTrailerId(id);
      void resolvePair(selectedTruckId, id);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setBusy(true);
    setError(null);
    try {
      if (removeTarget.kind === "truck") {
        const { error: rpcErr } = await supabase.rpc("delete_truck", { p_truck_id: removeTarget.id, p_company_id: companyId });
        if (rpcErr) throw rpcErr;
        if (selectedTruckId === removeTarget.id) setSelectedTruckId(null);
      } else {
        const { error: rpcErr } = await supabase.rpc("delete_trailer", { p_trailer_id: removeTarget.id, p_company_id: companyId });
        if (rpcErr) throw rpcErr;
        if (selectedTrailerId === removeTarget.id) setSelectedTrailerId(null);
      }
      setRemoveTarget(null);
      await Promise.all([loadEquipment(), onRefreshCombos()]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove equipment.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewTare() {
    if (!newTareTarget) return;
    const tare = Number(newTareInput);
    if (!Number.isFinite(tare) || tare <= 0) {
      setError("Enter a valid tare weight (lbs).");
      return;
    }
    const { truckId, trailerId } = newTareTarget;
    setNewTareTarget(null);
    setNewTareInput("");
    await resolvePair(truckId, trailerId, tare);
  }

  // Persist a partial (one-unit) or fully-cleared selection as the driver's
  // current held units before closing, so bobtail / trailer-only survives the
  // modal closing. A full pair is already a materialized combo (couple_combo
  // set current_* itself), so it's skipped. No-ops when nothing changed.
  async function handleClose() {
    try {
      if (setCurrentEquipment && !selectedComboId) {
        const t = selectedTruckId ?? null;
        // A trailer can't be linked without a truck.
        const r = t ? (selectedTrailerId ?? null) : null;
        const partialOrEmpty = !(t && r); // both set would be a full pair (couple path)
        const changed = t !== (currentTruckId ?? null) || r !== (currentTrailerId ?? null);
        if (partialOrEmpty && changed) {
          await setCurrentEquipment(t, r);
        }
      }
    } catch (e: any) {
      console.error("persist current equipment on close:", e?.message);
    }
    onClose();
  }

  return {
    handleTruckAdded,
    handleTrailerAdded,
    openEdit,
    openStatusFor,
    openStatusForTruck,
    openStatusForTrailer,
    openStatus,
    confirmCommandeer,
    confirmRemove,
    submitNewTare,
    handleClose,
  };
}
