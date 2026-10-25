"use client";
// app/planner/hooks/useTerminalProducts.ts
//
// The products on the selected rack with their last API and temperature readings, plus the rack name. Lifted out of PlannerHost unchanged.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ProductRow } from "../types";

type Loc = { selectedTerminalId?: string | number | null; selectedRackId?: string | number | null };

export function useTerminalProducts(location: Loc) {
  const [terminalProductsRaw, setTerminalProducts] = useState<ProductRow[]>([]);
  // Extract terminal products fetch as a named callback so it can be called post-load.
  //
  // Reads rack_product_status only -- every terminal always has at least
  // one rack now (auto-named "Main Rack" for terminals that never touched
  // the Terminal tab, see the "unify_terminals_onto_racks" migration), so
  // there's no more terminal-wide-pool-with-optional-rack-override dual
  // path: a rack IS the terminal's product list and reference reading, full
  // stop. Waits for location.selectedRackId to resolve (chooseTerminal sets
  // it async, right after selectedTerminalId) rather than reading anything
  // terminal-scoped in the meantime -- a brief empty list while it resolves
  // beats a stale/wrong terminal's data flashing first.
  const fetchTerminalProducts = useCallback(async () => {
    if (!location.selectedTerminalId || !location.selectedRackId) { setTerminalProducts([]); return; }
    const { data, error } = await supabase
      .from("rack_product_status")
      .select(`active, last_api, last_temp_f, updated_at, min_api_observed,
        products (product_id, product_name, display_name, description, product_code, button_code, hex_code, api_60, alpha_per_f, api_min, api_max, un_number, is_dyed, canonical_product_id)`)
      .eq("rack_id", location.selectedRackId);
    if (error) { setTerminalProducts([]); return; }
    // Stats lookup by product_id across ALL rows on this rack (not just
    // active ones) -- a rack-injected-variance product (e.g. dyed diesel)
    // pools its tracking onto the canonical product's row, which needs to
    // be found here even if the canonical product itself isn't separately
    // offered/active on this rack's driver-facing list.
    const statsByProductId: Record<string, { last_api: number | null; last_api_updated_at: string | null; last_temp_f: number | null; last_loaded_at: string | null; min_api_observed: number | null }> = {};
    for (const row of (data ?? []) as any[]) {
      const pid = row.products?.product_id;
      if (!pid) continue;
      statsByProductId[pid] = {
        last_api: row.last_api ?? null,
        last_api_updated_at: row.updated_at ?? null,
        last_temp_f: row.last_temp_f ?? null,
        last_loaded_at: row.updated_at ?? null,
        min_api_observed: row.min_api_observed ?? null,
      };
    }

    const products = (data ?? []).filter((row: any) => row.active !== false)
      .map((row: any) => {
        if (!row.products) return null;
        const own = statsByProductId[row.products.product_id];
        const canonicalId = row.products.canonical_product_id as string | null | undefined;
        const stats = (canonicalId && statsByProductId[canonicalId]) ? statsByProductId[canonicalId] : own;
        return { ...row.products, ...stats };
      })
      .filter(Boolean);
    setTerminalProducts(products as ProductRow[]);
  }, [location.selectedTerminalId, location.selectedRackId]);

  // Rack's own name, for ManageTerminalProductsModal's "Active products at
  // {terminal} — {rack}" label (hidden there for the generic "Main Rack"
  // default). Cheap, separate fetch rather than piggybacking on
  // shell.rackPickerRacks -- that list only exists transiently while the
  // rack-select sheet is open, not for whatever rack ends up selected.
  const [selectedRackName, setSelectedRackName] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!location.selectedRackId) { setSelectedRackName(undefined); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("terminal_racks")
        .select("rack_name")
        .eq("rack_id", location.selectedRackId)
        .maybeSingle();
      if (!cancelled) setSelectedRackName((data as any)?.rack_name ?? undefined);
    })();
    return () => { cancelled = true; };
  }, [location.selectedRackId]);

  useEffect(() => { fetchTerminalProducts(); }, [fetchTerminalProducts]);

  return { terminalProductsRaw, setTerminalProducts, fetchTerminalProducts, selectedRackName };
}
