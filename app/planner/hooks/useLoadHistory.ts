"use client";
// hooks/useLoadHistory.ts
// Fetches recent load_log rows for this user across all combos.
// Lines are lazy-fetched per row when the user expands it.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { deleteLoad as deleteLoadRpc } from "@/lib/supabase/load";
import { lastDays, rangeBounds, type DateRange } from "@/lib/reports/dateRange";

export type LoadHistoryRow = {
  load_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  combo_id: string;
  terminal_id: string;
  state_code: string | null;
  city_id?: string | null;
  city_name?: string | null;
  cg_bias?: number | null;
  planned_total_gal: number | null;
  planned_gross_lbs: number | null;
  actual_total_lbs: number | null;
  diff_lbs: number | null;
  planned_snapshot?: any | null;
  product_temp_f?: number | null;  // planned temp stored at load_log level
  // Resolved labels — filled in after join
  terminal_name?: string;
  combo_label?: string;
};

export type LoadHistoryLine = {
  comp_number: number;
  product_id: string | null;
  product_name: string | null;
  button_code: string | null;
  planned_gallons: number | null;
  actual_gallons: number | null;
  planned_lbs: number | null;
  actual_lbs: number | null;
  planned_temp_f: number | null;
  actual_temp_f: number | null;
  planned_api: number | null;
  planned_api_updated_at: string | null;
  actual_api: number | null;
};

export function useLoadHistory(authUserId: string) {
  const [rows, setRows] = useState<LoadHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // lines cache: load_id → lines array
  const [linesCache, setLinesCache] = useState<Record<string, LoadHistoryLine[]>>({});
  const [linesLoading, setLinesLoading] = useState<Record<string, boolean>>({});

  // range: local dates (both ends included), null = all time, left out = the last 30 days
  const fetch = useCallback(async (range: DateRange | undefined = lastDays(30)) => {
    if (!authUserId) return;
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("load_log")
        .select(`
          load_id, status, started_at, completed_at,
          combo_id, terminal_id, state_code, city_id,
          cg_bias,
          planned_total_gal, planned_gross_lbs,
          actual_total_lbs, diff_lbs,
          product_temp_f, planned_snapshot,
          cities(city_name)
        `)
        .eq("user_id", authUserId)
        // Only finalized loads belong in history. A "planned" row is a LOAD
        // tapped but never confirmed LOADED (app backgrounded, refreshed, or a
        // begin_load whose response was lost after commit) -- it has no actual
        // gallons/lbs and renders as a blank "PLANNED" entry. begin_load's own
        // per-combo cleanup removes most, but an abandoned-combo orphan can
        // linger; excluding non-"loaded" rows here keeps every history view
        // (My Loads, Admin Loads, Reports) showing real loads only.
        .eq("status", "loaded")
        .order("started_at", { ascending: false })
        .limit(200);

      if (range) {
        const { fromIso, toIso } = rangeBounds(range);
        q = q.gte("started_at", fromIso).lt("started_at", toIso);
      }

      const { data, error: err } = await q;
      if (err) { setError(err.message); return; }
      const mapped = (data ?? []).map((r: any) => ({
        ...r,
        city_name: (r.cities as any)?.city_name ?? null,
      }));
      setRows(mapped as LoadHistoryRow[]);
    } finally {
      setLoading(false);
    }
  }, [authUserId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Resolve terminal names and combo labels for all rows
  const resolveLabels = useCallback(async (
    rawRows: LoadHistoryRow[],
    terminalCatalog: any[],
    combos: any[],
  ): Promise<LoadHistoryRow[]> => {
    return rawRows.map((r) => {
      const terminal = terminalCatalog.find(
        (t) => String(t.terminal_id) === String(r.terminal_id)
      );
      const combo = combos.find(
        (c) => String(c.combo_id) === String(r.combo_id)
      );
      return {
        ...r,
        terminal_name: terminal?.terminal_name ?? terminal?.name ?? "Terminal",
        combo_label: combo
          ? `${combo.tractor_name ?? ""}${combo.trailer_name ? " / " + combo.trailer_name : ""}`.trim()
          : "Unknown combo",
      };
    });
  }, []);

  const fetchLines = useCallback(async (loadId: string, plannedSnapshot?: any, productTempF?: number | null) => {
    if (linesCache[loadId] || linesLoading[loadId]) return;
    setLinesLoading((prev) => ({ ...prev, [loadId]: true }));

    // Build a comp_number → snapshot line map for planned API + planned temp
    const snapshotByComp: Record<number, { planned_api?: number | null; planned_api_updated_at?: string | null; temp_f?: number | null }> = {};
    const snapshotLines: any[] = plannedSnapshot?.lines ?? [];
    for (const sl of snapshotLines) {
      const c = Number(sl.comp_number);
      if (c) snapshotByComp[c] = {
        planned_api: sl.planned_api ?? null,
        planned_api_updated_at: sl.planned_api_updated_at ?? null,
        temp_f: sl.temp_f ?? null,
      };
    }

    try {
      // Note: planned_api is not a column on load_lines — it comes from planned_snapshot.
      // actual_api IS a column (added via migration) and is now written by the updated RPC.
      const { data, error: err } = await supabase
        .from("load_lines")
        .select(`
          comp_number, product_id, planned_gallons, actual_gallons,
          planned_lbs, actual_lbs, temp_f, actual_temp_f, actual_api,
          products(product_name, display_name, button_code)
        `)
        .eq("load_id", loadId)
        .order("comp_number", { ascending: true });

      if (!err && data) {
        const lines: LoadHistoryLine[] = data.map((l: any) => {
          const comp = Number(l.comp_number);
          const snap = snapshotByComp[comp] ?? {};
          const isCompleted = !!l.actual_gallons || !!l.actual_lbs;
          return {
            comp_number: comp,
            product_id: l.product_id ?? null,
            product_name: l.products?.product_name ?? l.products?.display_name ?? null,
            button_code: (l.products as any)?.button_code ?? null,
            planned_gallons: l.planned_gallons != null ? Number(l.planned_gallons) : null,
            actual_gallons:  l.actual_gallons  != null ? Number(l.actual_gallons)  : null,
            planned_lbs:     l.planned_lbs     != null ? Number(l.planned_lbs)     : null,
            actual_lbs:      l.actual_lbs      != null ? Number(l.actual_lbs)      : null,
            // Planned temp: snapshot first, then load_log.product_temp_f (same for all comps on this load),
            // fallback to DB temp_f only for incomplete loads
            planned_temp_f: snap.temp_f != null
              ? Number(snap.temp_f)
              : productTempF != null
                ? Number(productTempF)
                : (!isCompleted && l.temp_f != null ? Number(l.temp_f) : null),
            // Actual temp: actual_temp_f column first, then temp_f if the load is completed
            // (completeLoad writes actual temp into temp_f, not actual_temp_f, on older loads)
            actual_temp_f: l.actual_temp_f != null
              ? Number(l.actual_temp_f)
              : (isCompleted && l.temp_f != null ? Number(l.temp_f) : null),
            // Planned API: from snapshot.lines[comp].planned_api (written by updated beginLoad)
            planned_api: snap.planned_api != null ? Number(snap.planned_api) : null,
            planned_api_updated_at: snap.planned_api_updated_at ?? null,
            // Actual API: now written by the updated complete_load RPC
            actual_api: l.actual_api != null ? Number(l.actual_api) : null,
          };
        });
        setLinesCache((prev) => ({ ...prev, [loadId]: lines }));
      }
    } finally {
      setLinesLoading((prev) => ({ ...prev, [loadId]: false }));
    }
  }, [linesCache, linesLoading]);

  // Deletes a load and removes it from the local rows list immediately —
  // covers both a manual delete from My Loads and the abandoned "planned"
  // rows this same RPC cleans up when the Loading modal is closed early.
  const deleteLoad = useCallback(async (loadId: string) => {
    await deleteLoadRpc(loadId);
    setRows((prev) => prev.filter((r) => r.load_id !== loadId));
    setLinesCache((prev) => {
      if (!(loadId in prev)) return prev;
      const next = { ...prev };
      delete next[loadId];
      return next;
    });
  }, []);

  return {
    rows,
    loading,
    error,
    linesCache,
    linesLoading,
    fetch,
    fetchLines,
    resolveLabels,
    deleteLoad,
  };
}
