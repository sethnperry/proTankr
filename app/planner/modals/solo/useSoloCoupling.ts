"use client";
// app/planner/modals/solo/useSoloCoupling.ts
//
// Coupling: resolving a truck/trailer pair, taps, commandeer/away/deadline checks.

import { supabase } from "@/lib/supabase/client";
import { takeOverParkedTrip } from "@/lib/trips/parkHandoff";
import type { Props } from "./types";

import type { useSoloState } from "./useSoloState";
import type { useSoloData } from "./useSoloData";

export function useSoloCoupling(props: Props, s: ReturnType<typeof useSoloState>, d: ReturnType<typeof useSoloData>) {
  const {
    authUserId,
    selectedComboId,
    onSelectComboId,
    onRefreshCombos,
    setupSession,
    trucks,
    trailers,
    combos,
    setError,
    setBusy,
    selectedTruckId,
    setSelectedTruckId,
    selectedTrailerId,
    setSelectedTrailerId,
    setNewTareTarget,
    driverHomeRegion,
    awayConfirmTarget,
    setAwayConfirmTarget,
    deadlineConfirmTarget,
    setDeadlineConfirmTarget,
    claimedByNames,
    setAwaitingTruck,
    setDetailUnit,
    coupleFrom,
    setCoupleFrom,
    setCommandeerTarget,
  } = s;
  const { loadEquipment } = d;
  async function resolvePair(truckId: string | null, trailerId: string | null, tareLbs?: number, forceClaim = false) {
    if (!truckId || !trailerId) {
      if (selectedComboId) onSelectComboId("");
      return;
    }

    const existing = combos.find((c) => String(c.truck_id) === String(truckId) && String(c.trailer_id) === String(trailerId));
    if (existing && !forceClaim) {
      if (String(existing.combo_id) !== String(selectedComboId)) onSelectComboId(String(existing.combo_id));
      // A shared truck: picking a pair whose trailer holds another driver's parked load takes that load over.
      if (!setupSession && authUserId) { try { await takeOverParkedTrip(trailerId, truckId, authUserId); } catch { /* the dashboard's Take Over Trip still works */ } }
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let comboId: string;
      if (setupSession) {
        // Full-app impersonation -- must couple on the TARGET driver's
        // behalf via the service-role proxy, not this browser's own
        // session (which only has RLS/RPC standing to act as auth.uid(),
        // the real admin). Confirmed live: without this branch, the combo
        // got claimed under the admin's own account, and
        // useEquipment.ts's setup-mode selectedComboId derivation (only
        // shows combos claimed_by the target user) silently reverted the
        // selection back to empty right after.
        const { coupleCombo } = await import("@/lib/adminSetupClient");
        try {
          const res = await coupleCombo(setupSession.targetUserId, truckId, trailerId, {
            tareLbs,
            force: true,
          });
          comboId = String(res?.data?.combo_id ?? "");
        } catch (e: any) {
          if (!tareLbs && /provide a tare weight/i.test(e?.message ?? "")) {
            setNewTareTarget({ truckId, trailerId });
            return;
          }
          throw e;
        }
      } else {
        const { data, error: rpcErr } = await supabase.rpc("couple_combo", {
          p_truck_id: truckId,
          p_trailer_id: trailerId,
          p_tare_lbs: tareLbs ?? null,
          // Lets re-selecting equipment here decouple+recouple in one step,
          // instead of rejecting with "already coupled" -- this screen's whole
          // point is trivial swapping. Fleet's Browse-Fleet-and-Couple flow
          // still defaults to p_force=false (unaffected).
          p_force: true,
        });
        if (rpcErr) {
          // No prior history for this exact pair -- needs a one-time tare
          // weight, same as fleet's "New Pairing" step. Prompt for it instead
          // of just surfacing the raw error.
          if (!tareLbs && /provide a tare weight/i.test(rpcErr.message ?? "")) {
            setNewTareTarget({ truckId, trailerId });
            return;
          }
          throw rpcErr;
        }
        comboId = String((data as any)?.combo_id ?? "");
      }
      if (!comboId) throw new Error("No combo_id returned.");
      if (!setupSession && authUserId) { try { await takeOverParkedTrip(trailerId, truckId, authUserId); } catch { /* the dashboard's Take Over Trip still works */ } }
      onSelectComboId(comboId);
      await Promise.all([loadEquipment(), onRefreshCombos()]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to pair equipment.");
    } finally {
      setBusy(false);
    }
  }

  // Only relevant when SELECTING a different truck/trailer -- deselecting
  // (tapping the currently-selected one to clear it) never commandeers
  // anything from anyone, so callers only check this for the incoming `id`.
  function claimedByOther(kind: "truck" | "trailer", id: string): string | null {
    const combo = combos.find((c) => c.active !== false && (kind === "truck" ? c.truck_id : c.trailer_id) === id);
    if (!combo?.claimed_by || combo.claimed_by === authUserId) return null;
    return claimedByNames[combo.claimed_by] ?? "another driver";
  }

  // Checked BEFORE the commandeer check so the two can combine in sequence
  // (an away, other-driver-claimed unit shows the away confirm first, then
  // the commandeer confirm once that's dismissed). Region-level mismatch
  // only. Trimmed + case-folded before comparing -- same reasoning as
  // isAway below (region and profiles.region are free text from
  // two different forms, so whitespace/casing must never read as a real
  // mismatch).
  function homeRegionMismatch(unit: { region: string | null }): string | null {
    if (!driverHomeRegion || !unit.region) return null;
    if (unit.region.trim().toLowerCase() === driverHomeRegion.trim().toLowerCase()) return null;
    return unit.region;
  }

  function toggleTruck(id: string, trailerOverride?: string | null, force = false) {
    const trailerSel = trailerOverride ?? selectedTrailerId;
    const next = !force && selectedTruckId === id ? null : id;
    if (next) setAwaitingTruck(false);
    if (next) {
      const unit = trucks.find((t) => t.truck_id === next);
      if (unit?.status_code === "deadline") {
        setDeadlineConfirmTarget({ kind: "truck", id: next, notes: unit.status_notes });
        return;
      }
      const unitRegion = unit ? homeRegionMismatch(unit) : null;
      if (unitRegion) {
        setAwayConfirmTarget({ kind: "truck", id: next, unitRegion });
        return;
      }
      const ownerName = claimedByOther("truck", next);
      if (ownerName) {
        setCommandeerTarget({ kind: "truck", id: next, ownerName });
        return;
      }
    }
    setSelectedTruckId(next);
    void resolvePair(next, trailerSel);
  }
  function toggleTrailer(id: string, truckOverride?: string | null, force = false) {
    const truckSel = truckOverride ?? selectedTruckId;
    const next = !force && selectedTrailerId === id ? null : id;
    if (next && !truckSel) {
      setError("Pick a truck first. A trailer can't be linked without one.");
      return;
    }
    if (next) {
      const unit = trailers.find((t) => t.trailer_id === next);
      if (unit?.status_code === "deadline") {
        setDeadlineConfirmTarget({ kind: "trailer", id: next, notes: unit.status_notes });
        return;
      }
      const unitRegion = unit ? homeRegionMismatch(unit) : null;
      if (unitRegion) {
        setAwayConfirmTarget({ kind: "trailer", id: next, unitRegion });
        return;
      }
      const ownerName = claimedByOther("trailer", next);
      if (ownerName) {
        setCommandeerTarget({ kind: "trailer", id: next, ownerName });
        return;
      }
    }
    setSelectedTrailerId(next);
    void resolvePair(truckSel, next);
  }

  // Couple: pick the first unit, close its pop-out, then tap the other kind to make the pairing.
  function startCouple(kind: "truck" | "trailer", id: string) {
    setDetailUnit(null);
    setCoupleFrom({ kind, id });
  }
  function boardTapTruck(id: string) {
    if (coupleFrom?.kind === "trailer") {
      finishCouple(id, coupleFrom.id, "truck");
      return;
    }
    if (coupleFrom?.kind === "truck") {
      setCoupleFrom(coupleFrom.id === id ? null : { kind: "truck", id });
      return;
    }
    setDetailUnit({ kind: "truck", id });
  }
  function boardTapTrailer(id: string) {
    if (coupleFrom?.kind === "truck") {
      finishCouple(coupleFrom.id, id, "trailer");
      return;
    }
    if (coupleFrom?.kind === "trailer") {
      setCoupleFrom(coupleFrom.id === id ? null : { kind: "trailer", id });
      return;
    }
    setDetailUnit({ kind: "trailer", id });
  }
  // Makes the pairing. The first-tapped unit is selected locally, then the normal tap chain runs
  // for the second so the deadline / away / commandeer confirms still apply. A brand-new pairing
  // asks for its tare weight (resolvePair's own prompt).
  function finishCouple(truckId: string, trailerId: string, second: "truck" | "trailer") {
    setCoupleFrom(null);
    if (second === "truck") {
      setSelectedTrailerId(trailerId);
      toggleTruck(truckId, trailerId, true);
    } else {
      setSelectedTruckId(truckId);
      toggleTrailer(trailerId, truckId, true);
    }
  }

  // Continues past the deadline confirm into the SAME away/commandeer
  // chain a normal toggle would have run next -- a unit can be deadlined
  // AND away AND claimed by someone else all at once, and should surface
  // every applicable warning in sequence, not just the first one hit.
  function confirmDeadline() {
    if (!deadlineConfirmTarget) return;
    const { kind, id } = deadlineConfirmTarget;
    setDeadlineConfirmTarget(null);
    const unit = kind === "truck" ? trucks.find((t) => t.truck_id === id) : trailers.find((t) => t.trailer_id === id);
    const unitRegion = unit ? homeRegionMismatch(unit) : null;
    if (unitRegion) {
      setAwayConfirmTarget({ kind, id, unitRegion });
      return;
    }
    const ownerName = claimedByOther(kind, id);
    if (ownerName) {
      setCommandeerTarget({ kind, id, ownerName });
      return;
    }
    if (kind === "truck") {
      setSelectedTruckId(id);
      void resolvePair(id, selectedTrailerId);
    } else {
      setSelectedTrailerId(id);
      void resolvePair(selectedTruckId, id);
    }
  }

  // Continues past the away confirm into the SAME logic toggleTruck/
  // toggleTrailer would have run next (the commandeer check), rather than
  // coupling directly -- so a unit that's both away AND claimed by another
  // driver still surfaces both warnings, in sequence.
  function confirmAway() {
    if (!awayConfirmTarget) return;
    const { kind, id } = awayConfirmTarget;
    setAwayConfirmTarget(null);
    const ownerName = claimedByOther(kind, id);
    if (ownerName) {
      setCommandeerTarget({ kind, id, ownerName });
      return;
    }
    if (kind === "truck") {
      setSelectedTruckId(id);
      void resolvePair(id, selectedTrailerId);
    } else {
      setSelectedTrailerId(id);
      void resolvePair(selectedTruckId, id);
    }
  }

  // Auto-select the just-added truck/trailer when it's this equipment's
  // first one -- "wasEmpty" is captured from the still-stale `trucks`/
  // `trailers` closure BEFORE loadEquipment() refetches, so after a
  // genuinely-first add there's exactly one row to grab, no ordering or
  // created_at column needed.

  return {
    resolvePair,
    toggleTruck,
    toggleTrailer,
    startCouple,
    boardTapTruck,
    boardTapTrailer,
    confirmDeadline,
    confirmAway,
  };
}
