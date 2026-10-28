"use client";
// lib/suppliers/useTerminalSuppliers.ts
//
// Server reads and writes for supplier steps at a terminal
// (supplier_terminal_steps, company-only) and the shared terminal note
// (terminal_notes, every company). See 20261017000000_supplier_terminal_steps.
// All writes are best effort from the caller's point of view: they return an
// error string instead of throwing.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { looksLikeAccountNumber } from "./noteGuard";

export type SupplierSteps = {
  company_id: string;
  supplier_id: string;
  terminal_id: string;
  steps: string[];
  account_number: string | null;
  account_locked: boolean;
  step_locks: boolean[]; // one per step
  notes: string | null;
  updated_by: string | null;
  steps_updated_at: string | null;
  last_used_at: string | null;
  last_loaded_at: string | null;
  last_loaded_by: string | null;
  issue_at: string | null;
  issue_by: string | null;
  issue_note: string | null;
};

export type TerminalNote = { note: string; updated_by: string | null; updated_at: string | null };

const COLS =
  "company_id,supplier_id,terminal_id,steps,account_number,account_locked,step_locks,notes,updated_by,steps_updated_at,last_used_at,last_loaded_at,last_loaded_by,issue_at,issue_by,issue_note";

async function namesFor(ids: (string | null)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return {};
  try {
    const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: uniq });
    const out: Record<string, string> = {};
    for (const r of (data ?? []) as { user_id: string; display_name: string | null }[]) out[r.user_id] = r.display_name ?? "";
    return out;
  } catch {
    return {};
  }
}

export function useTerminalSuppliers(companyId: string | null, terminalId: string | null) {
  const qc = useQueryClient();
  const key = ["supplierSteps", companyId, terminalId];
  const q = useQuery({
    queryKey: key,
    enabled: !!companyId && !!terminalId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_terminal_steps")
        .select(COLS)
        .eq("company_id", companyId!)
        .eq("terminal_id", terminalId!);
      if (error) throw error;
      const rows = ((data ?? []) as any[]).map((r) => ({
        ...r,
        steps: Array.isArray(r.steps) ? r.steps.map((s: unknown) => String(s ?? "")) : [],
        account_locked: !!r.account_locked,
        step_locks: Array.isArray(r.step_locks) ? r.step_locks.map((x: unknown) => x === true) : [],
      })) as SupplierSteps[];
      const names = await namesFor(rows.flatMap((r) => [r.updated_by, r.last_loaded_by, r.issue_by]));
      return { rows, names };
    },
  });
  const noteKey = ["terminalNote", terminalId];
  const nq = useQuery({
    queryKey: noteKey,
    enabled: !!terminalId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terminal_notes")
        .select("note,updated_by,updated_at")
        .eq("terminal_id", terminalId!)
        .maybeSingle();
      if (error) throw error;
      const note = (data as TerminalNote | null) ?? null;
      const names = await namesFor([note?.updated_by ?? null]);
      return { note, names };
    },
  });

  const bySupplier = useMemo(() => {
    const m = new Map<string, SupplierSteps>();
    for (const r of q.data?.rows ?? []) m.set(r.supplier_id, r);
    return m;
  }, [q.data]);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["supplierSteps", companyId, terminalId] });
    void qc.invalidateQueries({ queryKey: ["terminalNote", terminalId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, companyId, terminalId]);

  return {
    bySupplier,
    names: { ...(q.data?.names ?? {}), ...(nq.data?.names ?? {}) },
    terminalNote: nq.data?.note ?? null,
    loading: q.isLoading,
    refresh,
  };
}

type Ids = { companyId: string; supplierId: string; terminalId: string };

// Terminals that share sourcing with this one (terminal_sourcing_groups), this terminal included.
const groupCache = new Map<string, { at: number; rows: { terminal_id: string; group_key: string }[] }>();
export async function sharedTerminals(companyId: string, terminalId: string): Promise<string[]> {
  let hit = groupCache.get(companyId);
  if (!hit || Date.now() - hit.at > 5 * 60_000) {
    const { data, error } = await supabase.from("terminal_sourcing_groups").select("terminal_id,group_key").eq("company_id", companyId);
    hit = { at: Date.now(), rows: error ? [] : ((data ?? []) as { terminal_id: string; group_key: string }[]) };
    groupCache.set(companyId, hit);
  }
  const mine = hit.rows.find((r) => String(r.terminal_id) === terminalId);
  if (!mine) return [terminalId];
  return hit.rows.filter((r) => r.group_key === mine.group_key).map((r) => String(r.terminal_id));
}

async function upsert(ids: Ids, patch: Record<string, unknown>): Promise<string | null> {
  // Writes go to every terminal that shares sourcing here, so they stay the same.
  const terminals = await sharedTerminals(ids.companyId, ids.terminalId);
  const now = new Date().toISOString();
  const { error } = await supabase.from("supplier_terminal_steps").upsert(
    terminals.map((t) => ({ company_id: ids.companyId, supplier_id: ids.supplierId, terminal_id: t, updated_at: now, ...patch })),
    { onConflict: "supplier_id,terminal_id" },
  );
  return error ? error.message : null;
}

/** Links a supplier to a terminal (it now shows first there). Keeps steps. */
export function linkSupplierToTerminal(ids: Ids): Promise<string | null> {
  return upsert(ids, { last_used_at: new Date().toISOString() });
}

/** Saves the steps and notes. Editing clears a "not working" flag. */
export function saveSupplierSteps(ids: Ids, steps: string[], notes: string, userId: string): Promise<string | null> {
  const now = new Date().toISOString();
  return upsert(ids, {
    steps: steps.map((s) => s.trim()).filter(Boolean),
    notes: notes.trim() || null,
    updated_by: userId,
    steps_updated_at: now,
    issue_at: null, issue_by: null, issue_note: null,
  });
}

/** Flags the steps as not working (account didn't work, etc.). */
export function reportSupplierIssue(ids: Ids, note: string, userId: string): Promise<string | null> {
  return upsert(ids, { issue_at: new Date().toISOString(), issue_by: userId, issue_note: note.trim() || null });
}

/** A load finished on these suppliers here: stamps it and clears any flag. */
export async function markSuppliersLoaded(companyId: string, terminalId: string, supplierIds: string[], userId: string): Promise<void> {
  const now = new Date().toISOString();
  for (const supplierId of [...new Set(supplierIds)]) {
    const err = await upsert({ companyId, supplierId, terminalId }, {
      last_used_at: now, last_loaded_at: now, last_loaded_by: userId,
      issue_at: null, issue_by: null, issue_note: null,
    });
    if (err) console.warn("[suppliers] mark loaded failed (non-fatal):", err);
  }
}

export async function saveTerminalNote(terminalId: string, note: string, userId: string): Promise<string | null> {
  if (looksLikeAccountNumber(note)) return "That looks like an account number or code. Put it in the supplier steps (company only).";
  const { error } = await supabase.from("terminal_notes").upsert(
    { terminal_id: terminalId, note: note.trim(), updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "terminal_id" },
  );
  return error ? error.message : null;
}
