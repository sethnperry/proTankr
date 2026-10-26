"use client";
// app/planner/hooks/loadWorkflow/types.ts
//
// Types for the load workflow.

import type { PlanRow, ProductRow } from "../../types";
import type { CapacityResult } from "@/lib/capacity/computeAvailableCapacity";

/** One compartment's real, driver-entered line -- what the post-load Report
 *  view (LoadingModal, "report mode") renders per compartment and sums per
 *  product. Built fresh every time a report is opened (either right after a
 *  real completion, or when re-viewing a past completed load at this
 *  terminal) -- never persisted client-side beyond that. */
export type ReportLine = {
  comp: number;
  productId: string;
  gallons: number;
  lbs: number | null;
  api: number | null;
  tempF: number | null;
};

export type Props = {
  /** Available capacity for the live plan, measured against the CONFIGURED
   *  compartment caps rather than the driver's own capOverride -- see
   *  page.tsx's capacityResult. Null whenever there's no solvable plan. */
  capacityResult?: CapacityResult | null;
  authUserId: string | null;
  selectedComboId: string;
  selectedTerminalId: string;
  selectedRackId?: string | null; // see CLAUDE.md "rack-aware loading"
  selectedState: string;
  selectedCity: string;
  selectedCityId: string | null;
  tare: number;
  cgBias: number;
  ambientTempF: number | null;
  tempF: number;
  planRows: PlanRow[];
  plannedGallonsTotal: number;
  plannedWeightLbs: number;
  terminalProducts: ProductRow[];
  productNameById: Map<string, string>;
  productInputs: Record<string, { api?: string; tempF?: number }>;
  setProductInputs: (v: Record<string, { api?: string; tempF?: number }>) => void;
  // Resets the Loading modal's Plan Review gallons override (page.tsx state)
  // on every fresh LOAD tap -- same trigger/place setProductInputs already
  // resets for the identical reason. Optional only so this hook doesn't
  // break if ever constructed without it (defensive, not expected in practice).
  setLoadingGallonsOverride?: (v: Record<number, number>) => void;
  // Post-load refresh callbacks
  onRefreshTerminalProducts?: () => Promise<void>; // re-fetch last_api, last_temp_f
  onRefreshTerminalAccess?: () => Promise<void>; // re-fetch terminal expiry dates
  onPostLoadComplete?: () => Promise<void>; // re-read load_log for slot 0 / slip seat
  predictedTempF?: number | null; // what the predictor said at plan time
  unbiasedPredictedTempF?: number | null; // same, before the learned terminal bias
  activeSlotLetter?: number | null; // which named preset (1-5 / A-E) was active when LOAD was tapped, for the recap card's "Plan X" label
};
