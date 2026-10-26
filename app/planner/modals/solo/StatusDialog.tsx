"use client";
// app/planner/modals/solo/StatusDialog.tsx
//
// Update Status (STUD) dialog.

import EquipmentStatusModal from "../EquipmentStatusModal";
import type { SoloModel } from "./useSoloEquipment";

export function StatusDialog({ m }: { m: SoloModel }) {
  const {
    companyId,
    loadEquipment,
    onRefreshCombos,
    onRefreshCurrentEquipment,
    onSelectComboId,
    selectedComboId,
    setAwaitingTruck,
    setPickerOpen,
    setSelectedTrailerId,
    setSelectedTruckId,
    setStatusFlow,
    setStatusTarget,
    statusFlow,
    statusTarget,
  } = m;
  return (
    <>
      {statusTarget && (
        <EquipmentStatusModal
          open={!!statusTarget}
          onClose={() => {
            setStatusTarget(null);
            setStatusFlow(null);
          }}
          companyId={companyId}
          unitKind={statusTarget.kind}
          unitId={statusTarget.id}
          unitName={statusTarget.name}
          currentStatus={statusFlow ? "readyline" : statusTarget.status}
          locationOptional={!!statusFlow}
          currentNotes={statusTarget.notes}
          currentSubStatus={statusTarget.subStatus}
          homeLocalArea={statusTarget.homeLocalArea}
          onSaved={(newStatus) => {
            // Deadline/Readyline evict the unit from whoever held it
            // (set_equipment_status -> _evict_combo_to_partial) -- it's no
            // longer meaningfully "selected" in an active sense, so drop it
            // from local selection state AND the PARENT's own combo
            // pointer (selectedComboId lives in useEquipment.ts, not here)
            // -- the now-deactivated combo has already dropped out of
            // `combos`, so leaving selectedComboId pointing at it would
            // make the "sync local selection from external state" effect
            // fall back to currentTruckId/currentTrailerId below instead.
            // Real bug fixed here: that fallback is only trustworthy once
            // it's actually refreshed from the server -- couple_combo and
            // this RPC both write user_settings.current_truck_id/
            // current_trailer_id server-side, but nothing besides
            // setCurrentEquipment's own writer ever re-fetches them
            // client-side, so the currentTruckId/currentTrailerId PROPS
            // here can be stale from whenever this session last loaded
            // them (e.g. still naming a trailer from an earlier pairing).
            // Without the refresh below, deadlining a trailer could show
            // the truck re-paired with that stale leftover trailer
            // instead of bobtail. Setting status back to "in_use" evicts
            // nothing -- leave the current selection exactly as it was.
            if (statusFlow === "drop_trailer") {
              // Trailer is dropped; the truck stays with the driver (bobtail).
              setSelectedTrailerId(null);
              onSelectComboId("");
              setStatusFlow(null);
              void (async () => {
                await onRefreshCurrentEquipment?.();
                await Promise.all([loadEquipment(), onRefreshCombos()]);
              })();
              return;
            }
            if (statusFlow === "park_truck") {
              // Truck is parked. A trailer can't be linked without a truck, so the
              // trailer waits here (selected, unlinked) for a new truck, or is
              // cleared too if the driver leaves without picking one.
              setSelectedTruckId(null);
              onSelectComboId("");
              setStatusFlow(null);
              setAwaitingTruck(true);
              setPickerOpen(true);
              void (async () => {
                await onRefreshCurrentEquipment?.();
                await Promise.all([loadEquipment(), onRefreshCombos()]);
              })();
              return;
            }
            if (newStatus !== "in_use") {
              if (statusTarget.kind === "truck") setSelectedTruckId(null);
              else setSelectedTrailerId(null);
              if (selectedComboId) onSelectComboId("");
            }
            // currentTruckId/currentTrailerId MUST be refreshed before the
            // combo list refreshes -- once combos drops the now-inactive
            // combo, the sync effect's fallback reads whatever
            // currentTruckId/currentTrailerId currently are, so refreshing
            // them first (not in parallel) avoids a moment where it reads
            // the still-stale pre-eviction values.
            void (async () => {
              if (newStatus !== "in_use") await onRefreshCurrentEquipment?.();
              await Promise.all([loadEquipment(), onRefreshCombos()]);
            })();
          }}
        />
      )}
    </>
  );
}
