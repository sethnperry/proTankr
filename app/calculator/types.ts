// types.ts — shared types for the calculator feature
// Extracted from page.tsx. Import from here, not from page.tsx.

export type CompPlanInput = {
  empty: boolean;
  productId: string; // "" means none selected
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
  gross_limit_lbs: number | null;
  buffer_lbs: number | null;
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
  max_gallons: number | null;
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
  last_api?: number | null;
  last_api_updated_at?: string | null;
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
  tempF: number;
  cgSlider: number;
  compPlan: Record<number, CompPlanInput>;
};

export type LoadReport = {
  planned_total_gal: number;
  planned_gross_lbs: number | null;
  actual_gross_lbs: number | null;
  diff_lbs: number | null;
};
