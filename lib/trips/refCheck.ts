"use client";
// lib/trips/refCheck.ts
//
// Order and BOL duplicate checks: the phone's own trips first (works offline),
// then the company's trips on the server. A server error or no signal just
// skips the server half; the driver can still save.

import { supabase } from "@/lib/supabase/client";
import { conflicts, normalizeRef, usedBolNumbers } from "./refs";
import type { TripCompartmentLoadRow, TripRow } from "./types";

function variants(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    out.add(t);
    out.add(t.toUpperCase());
    out.add(t.toLowerCase());
  }
  return [...out];
}

// Typed values that match an order number on another of the company's live
// trips on the server.
export async function serverOrderConflicts(companyId: string, values: string[], excludeTripId: string | null): Promise<string[]> {
  const v = variants(values);
  if (!v.length) return [];
  try {
    const { data, error } = await supabase
      .from("trip_orders")
      .select("order_number, trip_id, trips!inner(company_id, status)")
      .eq("trips.company_id", companyId)
      .neq("trips.status", "cancelled")
      .in("order_number", v);
    if (error || !data) return [];
    const used = new Set(
      (data as { order_number: string | null; trip_id: string }[])
        .filter((r) => r.trip_id !== excludeTripId)
        .map((r) => normalizeRef(r.order_number)),
    );
    return values.filter((x) => used.has(normalizeRef(x)));
  } catch {
    return [];
  }
}

// Typed values that match a BOL on another compartment load on the server.
export async function serverBolConflicts(companyId: string, values: string[], excludeIds: Set<string>): Promise<string[]> {
  const v = variants(values);
  if (!v.length) return [];
  try {
    const { data, error } = await supabase
      .from("trip_compartment_loads")
      .select("compartment_load_id, bol_number, disposition, trips!inner(company_id, status)")
      .eq("trips.company_id", companyId)
      .neq("trips.status", "cancelled")
      .neq("disposition", "cancelled")
      .in("bol_number", v);
    if (error || !data) return [];
    const used = new Set(
      (data as { compartment_load_id: string; bol_number: string | null }[])
        .filter((r) => !excludeIds.has(r.compartment_load_id))
        .map((r) => normalizeRef(r.bol_number)),
    );
    return values.filter((x) => used.has(normalizeRef(x)));
  } catch {
    return [];
  }
}

// BOL numbers among `values` already used somewhere else: the phone's own
// trips first, then the server. `excludeIds` are the compartment loads being
// saved now, so one BOL across several compartments of the same load is fine.
export async function bolConflicts(
  trips: TripRow[],
  compLoads: TripCompartmentLoadRow[],
  companyId: string | null,
  values: string[],
  excludeIds: Set<string>,
): Promise<string[]> {
  const local = conflicts(values, usedBolNumbers(trips, compLoads, excludeIds));
  const server = companyId ? await serverBolConflicts(companyId, values, excludeIds) : [];
  const out = [...local];
  for (const s of server) if (!out.some((o) => normalizeRef(o) === normalizeRef(s))) out.push(s);
  return out;
}
