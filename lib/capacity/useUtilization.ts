// lib/capacity/useUtilization.ts
//
// Phase 1 read helpers. Query only -- no writes, no display decisions.
//
// Deliberately NOT a leaderboard (spec section 17). There is no ranking, no
// top/bottom list and no driver-vs-driver comparison here, and the fleet
// helper returns rows keyed by driver for a table sorted by name, not by
// score. The question this is meant to answer is "am I using the capacity that
// was actually available to me," not "am I beating Bob."

"use client";

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  aggregateHeadroom,
  aggregateUtilization,
  groupUtilizationByDriver,
  normalizeUtilizationRow,
} from "./computeUtilization";
import type { AggregatableHeadroom, HeadroomSummary } from "./computeUtilization";
import { supabase } from "@/lib/supabase/client";

export type UtilizationRow = {
  load_id: string;
  driver_id: string;
  loaded_at: string | null;
  available_gallons: number;
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  utilization_pct: number | null;
  eligibility: "eligible" | "excluded_constraint" | "excluded_safety" | "excluded_incomplete_data";
  exception_reason: string | null;
};

// The period aggregate lives in computeUtilization.ts (pure, unit-tested) and
// is re-exported here so callers have one import for the read side. There is
// deliberately no second implementation -- an earlier draft had one here, and
// two copies of the same gallon-weighted math is exactly how this project has
// drifted before.
export { aggregateUtilization as summarize } from "./computeUtilization";
export { groupUtilizationByDriver } from "./computeUtilization";
export type {
  DriverUtilizationGroup,
  HeadroomSummary,
  UtilizationSummary,
} from "./computeUtilization";

// PostgREST puts filters in the query string, so an `.in()` of raw UUIDs is
// bounded by URL length. 200 ids is ~7.5KB of list -- comfortably under the
// usual 8KB request-line ceiling with the rest of the URL to spare.
const ID_CHUNK = 200;

const SELECT =
  "load_id, driver_id, loaded_at, available_gallons, effective_available_gallons, " +
  "actual_gallons, unused_gallons, utilization_pct, eligibility, exception_reason";

async function fetchRows(filter: { driverId?: string; companyId?: string; since: string; until?: string }) {
  let q = supabase.from("load_utilization").select(SELECT).gte("loaded_at", filter.since);
  if (filter.until) q = q.lte("loaded_at", filter.until);
  if (filter.driverId) q = q.eq("driver_id", filter.driverId);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);

  const { data, error } = await q.order("loaded_at", { ascending: false });
  // Surfaced, not swallowed: a silent empty result here would read as "this
  // driver hauled nothing," which is a much worse lie than an error.
  if (error) throw error;
  // Cast through unknown: these tables are new in this pass, so the generated
  // Supabase types don't know them yet and infer an error shape for the select.
  //
  // Normalised on the way out so UtilizationRow's `number` fields really are
  // numbers. Without this the type is a promise the read path doesn't keep,
  // and a consumer that formats a value (`pct.toFixed(1)`) throws rather than
  // degrading -- which takes down the whole Reports modal, not just one cell.
  return ((data ?? []) as unknown as UtilizationRow[]).map(normalizeUtilizationRow);
}

/** One driver's own loads over a period. */
export function useDriverUtilization(driverId: string | null, since: string | null, until?: string) {
  return useQuery({
    queryKey: ["utilization", "driver", driverId, since, until ?? null],
    enabled: Boolean(driverId && since),
    queryFn: () => fetchRows({ driverId: driverId!, since: since!, until }),
    staleTime: 60_000,
  });
}

/** Every load in a company over a period. Staff-only by RLS, not by this hook. */
export function useCompanyUtilization(companyId: string | null, since: string | null, until?: string) {
  return useQuery({
    queryKey: ["utilization", "company", companyId, since, until ?? null],
    enabled: Boolean(companyId && since),
    queryFn: () => fetchRows({ companyId: companyId!, since: since!, until }),
    staleTime: 60_000,
  });
}

/**
 * Fleet headroom: what a safely-raised company target would unlock (see the
 * plan's section 4a). Reads the capacity snapshots rather than
 * load_utilization, because headroom is a property of what the equipment
 * could have carried, not of how well the driver did.
 *
 * Never shown to a driver -- their score must not move because of a
 * company-level decision they had no part in.
 *
 * TWO queries, not a PostgREST embed. `load_capacity_snapshot` and
 * `load_utilization` both have a foreign key to `load_log` and none to each
 * other, so `load_utilization?select=...,load_capacity_snapshot(...)` is not
 * an embeddable relationship: PostgREST answers PGRST200 ("could not find a
 * relationship"), verified against production. Going through load_utilization
 * first is still necessary rather than querying snapshots directly, because
 * `load_capacity_snapshot` carries no company_id of its own -- company
 * scoping only exists on the utilization row.
 *
 * Only ELIGIBLE loads contribute. Not a scoring decision -- headroom is not a
 * score -- but an excluded_incomplete_data load is one whose capacity could
 * not be established, so its snapshot can read 0 available against a real
 * legal figure and manufacture headroom out of a measurement failure. That
 * would inflate the exact number used to argue for raising a company's weight
 * target, which is the one direction this must never overstate. Restricting to
 * eligible loads also keeps this figure comparable with the utilization
 * percentage shown beside it, which covers the same loads.
 */
export function useCompanyHeadroom(companyId: string | null, since: string | null, until?: string) {
  return useQuery({
    queryKey: ["utilization", "headroom", companyId, since, until ?? null],
    enabled: Boolean(companyId && since),
    staleTime: 60_000,
    queryFn: async (): Promise<HeadroomSummary> => {
      let idq = supabase
        .from("load_utilization")
        .select("load_id")
        .eq("company_id", companyId!)
        .eq("eligibility", "eligible")
        .gte("loaded_at", since!);
      if (until) idq = idq.lt("loaded_at", until);
      const { data: idRows, error: idErr } = await idq;
      if (idErr) throw idErr;

      const ids = ((idRows ?? []) as { load_id: string }[]).map((r) => r.load_id);
      if (ids.length === 0) return aggregateHeadroom([]);

      // Chunked: a period with hundreds of loads would otherwise put hundreds
      // of UUIDs into one request URL.
      const snapshots: AggregatableHeadroom[] = [];
      for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const { data, error } = await supabase
          .from("load_capacity_snapshot")
          .select("available_gallons, capacity_at_legal_gallons, limiting_factor")
          .in("load_id", ids.slice(i, i + ID_CHUNK));
        if (error) throw error;
        snapshots.push(...((data ?? []) as unknown as AggregatableHeadroom[]));
      }

      return aggregateHeadroom(snapshots);
    },
  });
}

const EMPTY_ROWS: UtilizationRow[] = [];

/**
 * One driver's own period performance -- the summary behind the Planner card
 * and the Reports section. Rows come back newest-first for the history list.
 *
 * Deliberately takes `since` rather than reading the company's report-period
 * settings itself: measurement must work for a company that has configured
 * nothing at all (spec TEST K), so the caller decides whether that's a real
 * configured period or a plain rolling window.
 */
export function useDriverPeriodUtilization(driverId: string | null, since: string | null) {
  const query = useDriverUtilization(driverId, since);
  const rows = query.data ?? EMPTY_ROWS;
  const summary = useMemo(() => aggregateUtilization(rows), [rows]);
  return { rows, summary, isLoading: query.isLoading, error: query.error };
}

/**
 * The whole company's period performance -- the summary behind the fleet
 * dashboard. Staff-only by RLS (`load_utilization_staff_read` covers
 * owner/admin/lead/dispatch via is_company_staff), not by anything here.
 *
 * Mirrors useDriverPeriodUtilization deliberately: same rows, same aggregate,
 * same shape, so the fleet headline and a driver's own card can never be
 * computed two different ways.
 */
export function useFleetPeriodUtilization(companyId: string | null, since: string | null, until?: string) {
  const query = useCompanyUtilization(companyId, since, until);
  const rows = query.data ?? EMPTY_ROWS;
  const summary = useMemo(() => aggregateUtilization(rows), [rows]);
  return { rows, summary, isLoading: query.isLoading, error: query.error };
}
