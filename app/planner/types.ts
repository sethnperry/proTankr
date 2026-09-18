// types.ts — shared types for the Planner feature
// Extracted from page.tsx. Import from here, not from page.tsx.

export type CompPlanInput = {
  empty: boolean;
  productId: string; // "" means none selected
  // Temporary per-load ceiling, bounded to the compartment's configured
  // cap_gallons -- never exceeds it. null/undefined = use the full
  // configured cap. Lives here (not separate state) so it rides along with
  // the rest of compPlan's existing localStorage + preset persistence for
  // free (usePlanSlots serializes compPlan wholesale).
  capOverride?: number | null;
};

export type PlanRow = {
  comp_number: number;
  max_gallons: number;
  planned_gallons: number;
  productId?: string;
  lbsPerGal?: number;
  position?: number;
};

export type PlanCalcRow = PlanRow & { lbsPerGal: number; position: number };

export type ComboRow = {
  combo_id: string;
  combo_name: string | null;
  truck_id: string | null;
  trailer_id: string | null;
  tare_lbs: number | null;
  target_weight: number | null;   // renamed from gross_limit_lbs
  coupled?: boolean | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  active: boolean | null;
};

export type TerminalRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  carded_on: string | null;
  expires_on?: string | null;
  status: "valid" | "expired" | "not_carded";
  starred: boolean | null;
};

export type TerminalCatalogRow = {
  terminal_id: string;
  state: string | null;
  city: string | null;
  terminal_name: string | null;
  timezone?: string | null;
  active: boolean | null;
  renewal_days?: number | null;
};

export type StateRow = {
  state_code: string;
  state_name: string | null;
  active: boolean | null;
};

export type CityRow = {
  city_id: string;
  state_code: string | null;
  city_name: string | null;
  active: boolean | null;
};

export type CompRow = {
  trailer_id: string;
  comp_number: number;
  max_gallons: number | null; // total physical volume -- informational only
  cap_gallons: number | null; // overflow-prevention ceiling -- this is what the solver uses
  position: number | null;
  active: boolean | null;
};

export type ProductRow = {
  product_id: string;
  product_name: string | null;
  display_name?: string | null;
  description?: string | null;
  product_code?: string | null;
  button_code?: string | null;
  hex_code?: string | null;
  api_60: number | null;
  alpha_per_f: number | null;
  // Published API range (products.api_min / api_max) -- "Safest" stale-API
  // choice assumes api_min (lowest = densest = heaviest). Nullable until the
  // published min/max is seeded (see migration 20260907070000).
  api_min?: number | null;
  api_max?: number | null;
  // Lowest API ever observed on this rack (rack_product_status.min_api_observed)
  // -- "Safe" stale-API choice assumes this terminal's own heaviest reading.
  min_api_observed?: number | null;
  last_api?: number | null;
  last_api_updated_at?: string | null;
  last_temp_f?: number | null;   // observed temp when last_api was recorded
  last_loaded_at?: string | null;
  un_number?: string | null;     // DOT UN number e.g. "UN1203" for placard logic
  is_dyed?: boolean | null;
  // When set, this product's API/temp tracking pools onto the canonical
  // product's terminal_products row instead of its own (rack-injected
  // variance like dye -- same tank, same feed). Driver-facing selection/
  // labeling is unaffected; only the underlying tracking is redirected.
  canonical_product_id?: string | null;
};

export type TerminalProductMetaRow = {
  terminal_id: string;
  product_id: string;
  last_api: number | null;
  last_api_updated_at: string | null;
  last_temp_f: number | null;
  last_loaded_at: string | null;
};

export type ActiveComp = {
  compNumber: number;
  maxGallons: number;
  position: number;
  productId: string;
  lbsPerGal: number;
};

export type PlanSnapshot = {
  v: 1;
  savedAt: number;
  terminalId: string;
  tempF?: number;
  // Written on every save (2026-08-04+); restored only for named presets
  // (slots 1-5), not slot 0's autosave/last-load draft -- see
  // usePlanSlots.ts's applySnapshot(). Optional only so old snapshots from
  // before this changed (or slot-0 snapshots, which never restore it) don't
  // fail the type.
  cgSlider?: number;
  compPlan: Record<number, CompPlanInput>;
  // Optional custom label for a named preset (slots 1-5 only -- slot 0's
  // autosave/last-load draft has no name concept). Lives inside this same
  // jsonb-backed snapshot rather than a new DB column -- user_plan_slots'
  // schema (confirmed directly against its migration) has no name/label
  // column, and payload is already the flexible place per-slot metadata
  // like this lives. Set via usePlanSlots.ts's renameSlot(), which touches
  // ONLY this field on an existing snapshot -- never via buildSnapshot's
  // normal save path, which would overwrite the slot's actual saved plan
  // with whatever's currently live on screen.
  name?: string;
  // Slot 0 only -- which named preset letter (1-5), if any, page.tsx's
  // activeSlotLetter/lastLoadedSlot was showing at the moment this
  // autosave fired. Restored on mount so the plan-letter icon/
  // PresetQuickPick highlight matches whatever was actually on screen
  // right before a refresh, instead of always snapping to whichever
  // preset the driver's last COMPLETED load happened to use (see
  // usePlanSlots.ts's "restore the live plan on combo change" effect).
  // null/undefined means "no preset was active" (a manually-edited plan).
  activeSlot?: number | null;
};

/** One load's payload-utilization result, as stored by
 *  record_load_utilization. Null percentage means the load was excluded (see
 *  eligibility) -- null says "no score", where a 0 would read as "this driver
 *  loaded nothing." */
export type LoadUtilization = {
  available_gallons: number;
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  utilization_pct: number | null;
  eligibility: "eligible" | "excluded_constraint" | "excluded_safety" | "excluded_incomplete_data";
  exception_reason: string | null;
};

export type LoadReport = {
  planned_total_gal: number;
  planned_gross_lbs: number | null;
  actual_gross_lbs: number | null;
  diff_lbs: number | null;
  // When this load was completed, and which named preset (1-5, mapped to
  // A-E) was active when it began -- lets the planner's recap card read as
  // "Recap · Plan A · 8/10/26" instead of an ambiguous number that looks
  // like it should track live plan edits. Both null for older loads
  // completed before this was tracked.
  completed_at: string | null;
  plan_slot: number | null;
  /** Payload utilization for this load. Null when the measurement hasn't run
   *  (migrations not applied yet, or the RPC failed -- it is non-fatal). Set
   *  from record_load_utilization's own return right after a completed load,
   *  and re-read from load_utilization when a past load is restored/recalled. */
  utilization?: LoadUtilization | null;
};
