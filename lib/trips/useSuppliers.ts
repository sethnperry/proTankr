"use client";
// lib/trips/useSuppliers.ts
//
// The company's supplier list. Rows live in the phone's trip store (so a
// supplier added with no signal is usable at once and syncs later) and are
// refreshed from the server on mount. Adding a name that's already on the
// list (ignoring case and spaces) returns the existing supplier, unless the caller says the name is
// only checked at one terminal (`atTerminal`): suppliers are per terminal, so "Contract" at Marathon
// and "Contract" at Citgo are two different suppliers that happen to share a name.

import { useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { cleanName, findSupplier } from "./refs";
import type { TripStore, TripStoreState } from "./tripStore";
import type { SupplierRow } from "./types";

export function useSuppliers(store: TripStore | null, state: TripStoreState | null, companyId: string | null, userId: string | null) {
  useEffect(() => {
    if (!store || !companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("suppliers")
          .select("supplier_id,company_id,name,is_active,created_by,client_updated_at")
          .eq("company_id", companyId);
        if (!cancelled && !error && data) store.hydrate("suppliers", data as SupplierRow[]);
      } catch {
        // offline: the phone's own copy stands
      }
    })();
    return () => { cancelled = true; };
  }, [store, companyId]);

  const suppliers = useMemo(() => {
    if (!state || !companyId) return [] as SupplierRow[];
    return (Object.values(state.rows.suppliers ?? {}) as SupplierRow[])
      .filter((s) => s.company_id === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state, companyId]);

  const addSupplier = useCallback((name: string, atTerminal?: SupplierRow[]): SupplierRow | null => {
    if (!store || !companyId) return null;
    const clean = cleanName(name);
    if (!clean) return null;
    const existing = findSupplier(atTerminal ?? suppliers, clean);
    if (existing) {
      if (!existing.is_active) store.put("suppliers", { supplier_id: existing.supplier_id, is_active: true });
      return { ...existing, is_active: true };
    }
    const row: SupplierRow = {
      supplier_id: crypto.randomUUID(),
      company_id: companyId,
      name: clean,
      is_active: true,
      created_by: userId,
    };
    store.put("suppliers", row);
    return row;
  }, [store, companyId, userId, suppliers]);

  return { suppliers, addSupplier };
}
