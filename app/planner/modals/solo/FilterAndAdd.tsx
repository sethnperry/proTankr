"use client";
// app/planner/modals/solo/FilterAndAdd.tsx
//
// Region / local area filter and the add truck / trailer dialogs.

import { TruckModal as AdminTruckModal, TrailerModal as AdminTrailerModal } from "@/lib/ui/driver/EquipmentDetails";
import RegionLocalAreaFilterModal from "../RegionLocalAreaFilterModal";
import type { SoloModel } from "./useSoloEquipment";

export function FilterAndAdd({ m }: { m: SoloModel }) {
  const {
    addTrailerOpen,
    addTruckOpen,
    companyId,
    filter,
    filterOpen,
    handleTrailerAdded,
    handleTruckAdded,
    setAddTrailerOpen,
    setAddTruckOpen,
    setFilter,
    setFilterOpen,
  } = m;
  return (
    <>
      {/* ── Filter (top right of main modal) ── */}
      <RegionLocalAreaFilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        companyId={companyId}
        // Solo companies' sole member is always role='admin' (existing
        // solo-provisioning architecture) -- no myRole prop needed here to
        // decide add/edit/remove access, unlike the fleet-tier equivalent.
        canManage
        filter={filter}
        onChange={setFilter}
      />

      {/* ── Add new truck / trailer -- onDone also auto-selects when this
          was the equipment's first one (see handleTruckAdded/
          handleTrailerAdded's own comment), continuing the forced
          Truck -> Trailer -> Location onboarding sequence. ── */}
      {addTruckOpen && (
        <AdminTruckModal truck={null} companyId={companyId} onClose={() => setAddTruckOpen(false)} onDone={handleTruckAdded} />
      )}
      {addTrailerOpen && (
        <AdminTrailerModal trailer={null} companyId={companyId} onClose={() => setAddTrailerOpen(false)} onDone={handleTrailerAdded} />
      )}
    </>
  );
}
