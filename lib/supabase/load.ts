// lib/supabase/load.ts
import { supabase } from "@/lib/supabase/client";

export type BeginLoadLine = {
  comp_number: number;
  product_id: string;
  planned_gallons: number | null;
  planned_lbs: number | null;
  temp_f: number | null;
};

export type BeginLoadPayload = {
  combo_id: string;
  terminal_id: string;
  state_code?: string | null;
  city_id?: string | null;

  cg_bias?: number | null;
  ambient_temp_f?: number | null;
  product_temp_f?: number | null;

  planned_totals: {
    planned_total_gal: number | null;
    planned_total_lbs: number | null;
    planned_gross_lbs: number | null;
  };

  planned_snapshot?: unknown;
  lines: BeginLoadLine[];
};

export async function beginLoad(payload: BeginLoadPayload) {
  const { data, error } = await supabase.rpc("begin_load", { payload });
  if (error) throw error;
  return data as { load_id: string; lines_inserted: number };
}

// Phase 4: complete load
export type CompleteLoadLine = {
  comp_number: number;
  actual_gallons: number | null;
  actual_lbs: number | null;
  temp_f: number | null;
  // The driver-entered API for THIS compartment specifically (per-compartment
  // Log-the-Load sequence) -- distinct from product_updates' single
  // per-product "last observed" pick below.
  actual_api: number | null;
};

export type CompleteLoadPayload = {
  load_id: string;
  loaded_at?: string | null; // ISO timestamp
  completed_at?: string | null; // ISO timestamp
  lines: CompleteLoadLine[];
    // NEW (optional)
  product_updates?: Array<{
    product_id: string;
    api: number;
    temp_f: number | null;
  }>;
};

export type CompleteLoadResult = {
  ok: boolean;
  load_id: string;
  planned_lbs: number;
  actual_lbs: number;
  diff_lbs: number;
  completed_at: string;
};

export async function completeLoad(payload: CompleteLoadPayload) {
  const { data, error } = await supabase.rpc("complete_load", { payload });
  if (error) throw error;
  return data as CompleteLoadResult;
}

// Deletes a load_log row (and its load_lines) the caller owns -- used both
// to auto-clean an abandoned "planned" row when the Loading modal is closed
// without completing, and for the manual Delete action in My Loads.
export async function deleteLoad(loadId: string) {
  const { error } = await supabase.rpc("delete_load", { p_load_id: loadId });
  if (error) throw error;
}

// Atomically cancel a load ONLY while it is still "planned" (server-enforced
// with a row lock -- see migration 20260907100000). A load that has already
// reached "loaded" is left intact and this returns false, so a raced/lost-
// response completion can never be destroyed by a cancel. Use this for the
// in-flight cancel path, not delete_load.
export async function cancelPlannedLoad(loadId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("cancel_planned_load", { p_load_id: loadId });
  if (error) throw error;
  return Boolean(data);
}


