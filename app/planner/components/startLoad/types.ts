"use client";
// app/planner/components/startLoad/types.ts
//
// Part of StartLoadSheet.tsx: the values the sheet edits.

import type { StartLoadDelivery } from "@/lib/trips/tripLogic";
import type { TripSupplier } from "@/lib/trips/tripSupplier";

export type StartLoadValues = {
  orderNumber: string;
  extraOrderNumbers: string[];
  shipper: string;
  customer: string;
  deliveries: StartLoadDelivery[];
  beginMiles: string;
  startCity: string;
  startState: string;
  // Preset (1-5) the Planner loads when it opens for this trip. null = leave the Planner as is.
  planSlot: number | null;
  // Supplier dispatch named. Preset at every rack on the trip; changeable there.
  supplier: TripSupplier | null;
  // Dispatch's plan only: save it as a plan slot (optionally opening the Planner to change it first). null = run it as a temporary plan.
  savePlan: { modify: boolean } | null;
};
