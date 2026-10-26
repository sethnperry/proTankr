"use client";
// app/planner/modals/SoloEquipmentModal.tsx
//
// The Equipment modal (both tiers): pick your truck and trailer, couple, take over,
// filter, report, edit. This file only composes: the model is solo/useSoloEquipment,
// the dialogs are in solo/.

import { useSoloEquipment } from "./solo/useSoloEquipment";
import { MainDialog } from "./solo/MainDialog";
import { PickerDialog } from "./solo/PickerDialog";
import { UnitPopouts } from "./solo/UnitPopouts";
import { ReportDialogs } from "./solo/ReportDialogs";
import { StatusDialog } from "./solo/StatusDialog";
import { FilterAndAdd } from "./solo/FilterAndAdd";
import { ConfirmDialogs } from "./solo/ConfirmDialogs";
import type { Props } from "./solo/types";

export { computeUnitServiceDue, mostRecentServiceForUnit } from "./solo/serviceInfo";
export type { ServiceRecordLite, UnitLastService } from "./solo/serviceInfo";
export type { UnitServiceDue } from "./solo/types";

export default function SoloEquipmentModal(props: Props) {
  const m = useSoloEquipment(props);
  return (
    <>
      <MainDialog m={m} />
      <PickerDialog m={m} />
      <UnitPopouts m={m} />
      <ReportDialogs m={m} />
      <StatusDialog m={m} />
      <FilterAndAdd m={m} />
      <ConfirmDialogs m={m} />
    </>
  );
}
