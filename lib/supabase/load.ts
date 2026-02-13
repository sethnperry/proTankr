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
