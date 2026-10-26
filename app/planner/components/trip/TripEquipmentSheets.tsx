"use client";
// app/planner/components/trip/TripEquipmentSheets.tsx
//
// The two mid-trip equipment windows; props come from hooks/useTripEquipment.

import { EquipmentChangeWarning } from "./EquipmentChangeWarning";
import { TruckChangeSheet, type TruckChangeView } from "./TruckChangeSheet";

export type TripEquipmentSheetsProps = {
  warnOpen: boolean;
  trailerName: string | null;
  truckName: string | null;
  loaded: boolean;
  onWarnContinue: () => void;
  onWarnClose: () => void;
  truckOpen: boolean;
  truckView: TruckChangeView | null;
  truckBusy: boolean;
  onRecord: (fromOdo: number | null, toOdo: number | null) => void;
  onTruckClose: () => void;
};

export function TripEquipmentSheets(p: TripEquipmentSheetsProps) {
  return (
    <>
      <TruckChangeSheet open={p.truckOpen} view={p.truckView} busy={p.truckBusy} onRecord={p.onRecord} onClose={p.onTruckClose} />
      <EquipmentChangeWarning
        open={p.warnOpen}
        trailerName={p.trailerName}
        truckName={p.truckName}
        loaded={p.loaded}
        onContinue={p.onWarnContinue}
        onClose={p.onWarnClose}
      />
    </>
  );
}
