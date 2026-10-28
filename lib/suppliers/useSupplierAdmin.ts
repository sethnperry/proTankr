"use client";
// lib/suppliers/useSupplierAdmin.ts
//
// The Dispatch Dashboard's supplier screen: the company's supplier list,
// contract terms per supplier and terminal, and the writes behind them.
// Writes return an error string instead of throwing. Contracts are warn-only.

import { sharedTerminals } from "./useTerminalSuppliers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { cleanName, findSupplier } from "@/lib/trips/refs";
import { alignSteps } from "./locks";

export type CompanySupplier = { supplier_id: string; name: string; is_active: boolean };

export type SupplierContract = {
  supplier_id: string;
  terminal_id: string;
  limit_basis: "loads" | "gallons";
  per_day: number | null;
  per_week: number | null;
  reset_dow: number;   // 0 = Sunday
  reset_time: string;  // "HH:MM"
  paused: boolean;
  paused_note: string | null;
};

export const DEFAULT_CONTRACT = { limit_basis: "loads" as const, per_day: null, per_week: null, reset_dow: 0, reset_time: "00:00", paused: false, paused_note: null };

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function useCompanySuppliers(companyId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["companySuppliers", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("supplier_id,name,is_active").eq("company_id", companyId!).order("name");
      if (error) throw error;
      return (data ?? []) as CompanySupplier[];
    },
  });
  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: ["companySuppliers", companyId] }); }, [qc, companyId]);
  return { suppliers: (q.data ?? []).filter((s) => s.is_active), all: q.data ?? [], loading: q.isLoading, refresh };
}

export function useSupplierContracts(companyId: string | null, terminalId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["supplierContracts", companyId, terminalId],
    enabled: !!companyId && !!terminalId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_contracts")
        .select("supplier_id,terminal_id,limit_basis,per_day,per_week,reset_dow,reset_time,paused,paused_note")
        .eq("company_id", companyId!).eq("terminal_id", terminalId!);
      // Before the migration there is no table: nothing is paused or limited.
      if (error) return new Map<string, SupplierContract>();
      return new Map(((data ?? []) as any[]).map((r) => [r.supplier_id as string, {
        ...r, per_day: num(r.per_day), per_week: num(r.per_week), reset_time: String(r.reset_time ?? "00:00").slice(0, 5),
      } as SupplierContract]));
    },
  });
  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: ["supplierContracts", companyId, terminalId] }); }, [qc, companyId, terminalId]);
  return { contracts: q.data ?? new Map<string, SupplierContract>(), refresh };
}

/** Adds a supplier by name (or returns the one already on the list, bringing a retired one back). */
export async function addCompanySupplier(
  companyId: string, userId: string, name: string, existing: CompanySupplier[],
): Promise<{ supplier: CompanySupplier | null; error: string | null }> {
  const clean = cleanName(name);
  if (!clean) return { supplier: null, error: "Enter a name." };
  const found = findSupplier(existing as any, clean) as CompanySupplier | null;
  if (found) {
    if (!found.is_active) {
      const { error } = await supabase.from("suppliers").update({ is_active: true, client_updated_at: new Date().toISOString() }).eq("supplier_id", found.supplier_id);
      if (error) return { supplier: null, error: error.message };
    }
    return { supplier: { ...found, is_active: true }, error: null };
  }
  const row = { supplier_id: crypto.randomUUID(), company_id: companyId, name: clean, is_active: true, created_by: userId, client_updated_at: new Date().toISOString() };
  const { error } = await supabase.from("suppliers").insert(row);
  return error ? { supplier: null, error: error.message } : { supplier: { supplier_id: row.supplier_id, name: clean, is_active: true }, error: null };
}

export async function renameCompanySupplier(supplierId: string, name: string): Promise<string | null> {
  const clean = cleanName(name);
  if (!clean) return "Enter a name.";
  const { error } = await supabase.from("suppliers").update({ name: clean, client_updated_at: new Date().toISOString() }).eq("supplier_id", supplierId);
  return error ? error.message : null;
}

/** Retires a supplier everywhere (past loads keep the name). */
export async function retireCompanySupplier(supplierId: string): Promise<string | null> {
  const { error } = await supabase.from("suppliers").update({ is_active: false, client_updated_at: new Date().toISOString() }).eq("supplier_id", supplierId);
  return error ? error.message : null;
}

type Ids = { companyId: string; supplierId: string; terminalId: string };

/** Everything the expanded editor saves for one supplier at one terminal. */
export async function saveSupplierAdmin(ids: Ids, v: {
  account: string; accountLocked: boolean; steps: string[]; locks: boolean[]; notes: string;
}, userId: string, canLock: boolean): Promise<string | null> {
  const a = alignSteps(v.steps, v.locks);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    company_id: ids.companyId, supplier_id: ids.supplierId, terminal_id: ids.terminalId,
    account_number: v.account.trim() || null,
    steps: a.steps, notes: v.notes.trim() || null,
    updated_by: userId, steps_updated_at: now, updated_at: now,
    issue_at: null, issue_by: null, issue_note: null,
  };
  // Only a manager sends lock changes (the database refuses them from anyone else).
  if (canLock) { patch.account_locked = v.accountLocked; patch.step_locks = a.locks; }
  const terminals = await sharedTerminals(ids.companyId, ids.terminalId);
  const { error } = await supabase.from("supplier_terminal_steps").upsert(terminals.map((t) => ({ ...patch, terminal_id: t })), { onConflict: "supplier_id,terminal_id" });
  return error ? error.message : null;
}

export async function saveContract(ids: Ids, c: Omit<SupplierContract, "supplier_id" | "terminal_id">, userId: string, wasPaused: boolean): Promise<string | null> {
  const now = new Date().toISOString();
  const shared = await sharedTerminals(ids.companyId, ids.terminalId);
  const { error } = await supabase.from("supplier_contracts").upsert(shared.map((terminal_id) => ({
    company_id: ids.companyId, supplier_id: ids.supplierId, terminal_id,
    limit_basis: c.limit_basis, per_day: c.per_day, per_week: c.per_week, reset_dow: c.reset_dow, reset_time: c.reset_time,
    paused: c.paused, paused_note: c.paused ? (c.paused_note?.trim() || null) : null,
    ...(c.paused && !wasPaused ? { paused_at: now, paused_by: userId } : {}),
    ...(!c.paused ? { paused_at: null, paused_by: null } : {}),
    updated_by: userId, updated_at: now,
  })), { onConflict: "supplier_id,terminal_id" });
  return error ? error.message : null;
}

/** Takes a supplier off one terminal (its steps and contract go; the supplier stays). */
export async function unlinkSupplier(ids: Ids): Promise<string | null> {
  const shared = await sharedTerminals(ids.companyId, ids.terminalId);
  const a = await supabase.from("supplier_terminal_steps").delete().eq("supplier_id", ids.supplierId).in("terminal_id", shared);
  if (a.error) return a.error.message;
  await supabase.from("supplier_contracts").delete().eq("supplier_id", ids.supplierId).in("terminal_id", shared);
  return null;
}
