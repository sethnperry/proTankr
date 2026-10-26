"use client";
// app/planner/modals/decouple/types.ts
//
// Part of DecoupleModal.tsx.




export type TruckStatus   = "in_use" | "deadline" | "readyline";

export type TrailerStatus = "in_use" | "deadline" | "readyline";

export type Scenario = "swap_truck" | "swap_trailer" | "drop_trailer" | "park_both" | null;

export type Step     = "scenario" | "details" | "confirm";

export type UnitRow = { id: string; name: string };

export type Props = {
  open: boolean;
  onClose: () => void;
  comboId: string;
  truckId: string;
  trailerId: string;
  truckName: string;
  trailerName: string;
  companyId: string | null;
  uncoupledTrucks: UnitRow[];
  uncoupledTrailers: UnitRow[];
  onDecoupled: (newComboId?: string) => void;
};

// ─── Main modal ───────────────────────────────────────────────────────────────
