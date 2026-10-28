"use client";
// app/planner/modals/myLoads/types.ts
//
// Part of MyLoadsModal.tsx.

import type { LoadHistoryRow, LoadHistoryLine } from "../../hooks/useLoadHistory";



export type Props = {
  open: boolean;
  onClose: () => void;
  authUserId: string;
  rows: LoadHistoryRow[];
  loading: boolean;
  error: string | null;
  linesCache: Record<string, LoadHistoryLine[]>;
  linesLoading: Record<string, boolean>;
  onFetchLines: (loadId: string, plannedSnapshot?: any, productTempF?: number | null) => void;
  onFetchRange: (range: import("@/lib/reports/dateRange").DateRange) => void;
  /** For the period picker: whose period the reports follow. */
  companyId?: string | null;
  terminalCatalog: any[];
  headerOverride?: string;
  combos: any[];
  // Omitted entirely from the admin view (AdminLoadsModal.tsx) -- delete_load
  // is owner-checked server-side (auth.uid() must match), and restoring
  // another driver's load into the viewing admin's own planner never makes
  // sense, so those actions just don't render there.
  onDeleteLoad?: (loadId: string) => Promise<void>;
  onRestoreLoad?: (row: LoadHistoryRow) => void;
  // Deep-link target -- e.g. the Planner's "Recall Last Load" warning
  // sheet, for a load whose equipment can't safely be switched to (see
  // RecallDifferentEquipmentSheet.tsx). When set, this modal forces the
  // date range to "All" (the target load could be arbitrarily old) and
  // auto-expands it once its row is available, instead of the normal
  // reset-to-collapsed/7-day-range open behavior.
  initialExpandLoadId?: string | null;
};
