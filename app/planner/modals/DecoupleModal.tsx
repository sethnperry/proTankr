"use client";
// modals/DecoupleModal.tsx




// ─── Status codes ─────────────────────────────────────────────────────────────
// Fleet status is now a single 3-value vocabulary shared with the Equipment
// modal's own Update Status button (app/planner/modals/EquipmentStatusModal.tsx)
// and set_equipment_status -- this used to be a separate, richer 8-value
// scheme (AVAIL/PARK/BOBTAIL/MAINT/INSP/OOS/LOAD/CLEAN); that detail now
// lives in the Notes field instead of the status code itself (see
// 20260919000000_equipment_fleet_status.sql's own backfill mapping for the
// exact old-code -> new-status table).


import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export type { TruckStatus } from "./decouple/types";
export type { TrailerStatus } from "./decouple/types";

import { useDecouple } from "./decouple/useDecouple";
import { ScenarioStep } from "./decouple/ScenarioStep";
import { DetailsStep } from "./decouple/DetailsStep";
import { ConfirmStep } from "./decouple/ConfirmStep";
import type { Props } from "./decouple/types";

export default function DecoupleModal(props: Props) {
  const m = useDecouple(props);
  const { open, step, handleClose } = m;
  return (
    <FullscreenModal open={open} title="Decouple" onClose={handleClose} footer={null}>
      {step === "scenario" && <ScenarioStep m={m} />}
      {step === "details" && <DetailsStep m={m} />}
      {step === "confirm" && <ConfirmStep m={m} />}
    </FullscreenModal>
  );
}
