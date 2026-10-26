"use client";
// app/planner/modals/solo/ReportDialogs.tsx
//
// Scale ticket, service, wash, history and Binder dialogs and the unit pickers.

import ScaleTicketModal from "../ScaleTicketModal";
import ScaleHistoryModal from "../ScaleHistoryModal";
import RecordHistoryModal from "../RecordHistoryModal";
import BinderModal from "../BinderModal";
import { SimpleServiceModal } from "../ServiceTypeManager";
import UnitPickerSheet from "../UnitPickerSheet";
import { SimpleWashModal } from "./SimpleWashModal";
import type { SoloModel } from "./useSoloEquipment";

export function ReportDialogs({ m }: { m: SoloModel }) {
  const {
    authUserId,
    binderOpen,
    binderUnit,
    companyId,
    editPickerOpen,
    loadEquipment,
    loadServiceAndWash,
    loadServiceTypes,
    myRole,
    onRefreshCombos,
    openStatusForTrailer,
    openStatusForTruck,
    scaleHistoryOpen,
    scaleOpen,
    selectedCombo,
    selectedTrailerId,
    selectedTruckId,
    serviceHistoryOpen,
    serviceOpen,
    serviceTypes,
    setBinderOpen,
    setBinderUnit,
    setEditPickerOpen,
    setScaleHistoryOpen,
    setScaleOpen,
    setServiceHistoryOpen,
    setServiceOpen,
    setStatusPickerOpen,
    setWashHistoryOpen,
    setWashOpen,
    statusPickerOpen,
    trailers,
    trucks,
    washHistoryOpen,
    washOpen,
  } = m;
  return (
    <>
      {/* ── Scale Ticket (§6) ── */}
      {selectedCombo && (
        <ScaleTicketModal
          open={scaleOpen}
          onClose={() => setScaleOpen(false)}
          combo={selectedCombo}
          companyId={companyId}
          authUserId={authUserId}
          truckName={trucks.find((t) => t.truck_id === selectedCombo.truck_id)?.truck_name}
          trailerName={trailers.find((t) => t.trailer_id === selectedCombo.trailer_id)?.trailer_name}
          onSaved={() => {
            loadEquipment();
            onRefreshCombos();
          }}
          // Threaded rather than assumed. The nearby RegionLocalAreaFilterModal
          // hardcodes `canManage` on the reasoning that a solo company's sole
          // member is always role='admin' -- but companies.is_solo records how a
          // company was CREATED, not its current member count (CLAUDE.md's own
          // note on this, and the demo company is is_solo=true with two real
          // members), so a plain driver genuinely can reach this modal. The
          // target field is a measurement denominator now, so it takes the real
          // role instead of an assumption that is already known to be shaky.
          myRole={myRole}
        />
      )}

      {/* ── Scale History -- opened by tapping the Tare/Target report lines above ── */}
      <ScaleHistoryModal
        open={scaleHistoryOpen}
        onClose={() => setScaleHistoryOpen(false)}
        companyId={companyId}
        comboId={selectedCombo?.combo_id ?? null}
        onChanged={() => {
          loadEquipment();
          onRefreshCombos();
        }}
        truckName={trucks.find((t) => t.truck_id === selectedCombo?.truck_id)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedCombo?.trailer_id)?.trailer_name}
      />

      {/* ── Service / Wash (minimal for this pass -- full spec is §2/§3) ── */}
      <SimpleServiceModal
        open={serviceOpen}
        onClose={() => setServiceOpen(false)}
        companyId={companyId}
        authUserId={authUserId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name}
        serviceTypes={serviceTypes}
        onTypesChanged={loadServiceTypes}
        onSaved={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />
      <SimpleWashModal
        open={washOpen}
        onClose={() => setWashOpen(false)}
        companyId={companyId}
        authUserId={authUserId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name}
        onSaved={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />

      {/* ── Service / Wash history (§5) -- opened by tapping the report lines above ── */}
      <RecordHistoryModal
        open={serviceHistoryOpen}
        onClose={() => setServiceHistoryOpen(false)}
        kind="service"
        title="Service History"
        companyId={companyId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        trucks={trucks}
        trailers={trailers}
        onChanged={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />
      <RecordHistoryModal
        open={washHistoryOpen}
        onClose={() => setWashHistoryOpen(false)}
        kind="wash"
        title="Wash History"
        companyId={companyId}
        truckId={selectedTruckId}
        trailerId={selectedTrailerId}
        trucks={trucks}
        trailers={trailers}
        onChanged={() => loadServiceAndWash(selectedTruckId, selectedTrailerId)}
      />

      {/* ── Binder (§7) -- scoped to ONE unit at a time now (Edit picks
          which), per explicit follow-up: "Right now it is both units in
          one. We want to pick the unit, truck or trailer, then open it's
          binder." Neither selected (binderUnit === null) falls through to
          Binder's own existing "Select equipment first" empty state. ── */}
      <BinderModal
        open={binderOpen}
        onClose={() => setBinderOpen(false)}
        companyId={companyId}
        truckId={binderUnit === "truck" ? selectedTruckId : null}
        trailerId={binderUnit === "trailer" ? selectedTrailerId : null}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name}
        myRole={myRole}
      />

      {/* ── Edit: pick which unit (only shown when both are selected --
          openEdit() skips straight to Binder otherwise) ── */}
      <UnitPickerSheet
        open={editPickerOpen}
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name ?? null}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name ?? null}
        onPickTruck={() => {
          setEditPickerOpen(false);
          setBinderUnit("truck");
          setBinderOpen(true);
        }}
        onPickTrailer={() => {
          setEditPickerOpen(false);
          setBinderUnit("trailer");
          setBinderOpen(true);
        }}
        onCancel={() => setEditPickerOpen(false)}
      />

      {/* ── Update Status (STUD): pick which unit (only shown when both are
          selected -- openStatus() skips straight to EquipmentStatusModal
          otherwise), then that unit's status modal. ── */}
      <UnitPickerSheet
        open={statusPickerOpen}
        title="Update status for which unit?"
        subtitle="Flag it In Use, Deadline, or Readyline."
        truckName={trucks.find((t) => t.truck_id === selectedTruckId)?.truck_name ?? null}
        trailerName={trailers.find((t) => t.trailer_id === selectedTrailerId)?.trailer_name ?? null}
        onPickTruck={() => {
          setStatusPickerOpen(false);
          openStatusForTruck();
        }}
        onPickTrailer={() => {
          setStatusPickerOpen(false);
          openStatusForTrailer();
        }}
        onCancel={() => setStatusPickerOpen(false)}
      />
    </>
  );
}
