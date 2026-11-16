"use client";
// lib/sites/useSites.ts
//
// Site notes and the average time at a site, for terminals and delivery locations. A terminal's note is the shared
// terminal_notes row; a drop site's note is delivery_locations.notes (with who edited it and when). Reads are cached
// (React Query) so opening a window does not refetch what the page already knows.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { looksLikeAccountNumber } from "@/lib/suppliers/noteGuard";
import { averageMinutes } from "./siteStats";

export type SiteKind = "terminal" | "location";
export type SiteNote = { note: string; updatedBy: string | null; updatedByName: string | null; updatedAt: string | null };

async function nameOf(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [id] });
    const r = ((data ?? []) as { user_id: string; display_name: string | null }[])[0];
    return r?.display_name ?? null;
  } catch { return null; }
}

export function useSiteNote(kind: SiteKind, id: string | null) {
  const qc = useQueryClient();
  const key = ["siteNote", kind, id];
  const q = useQuery({
    queryKey: key, enabled: !!id, staleTime: 60_000,
    queryFn: async (): Promise<SiteNote> => {
      if (kind === "terminal") {
        const { data } = await supabase.from("terminal_notes").select("note, updated_by, updated_at").eq("terminal_id", id!).maybeSingle();
        const r = data as { note: string | null; updated_by: string | null; updated_at: string | null } | null;
        return { note: r?.note ?? "", updatedBy: r?.updated_by ?? null, updatedByName: await nameOf(r?.updated_by ?? null), updatedAt: r?.updated_at ?? null };
      }
      const { data } = await supabase.from("delivery_locations").select("notes, notes_updated_by, notes_updated_at").eq("location_id", id!).maybeSingle();
      const r = data as { notes: string | null; notes_updated_by?: string | null; notes_updated_at?: string | null } | null;
      return { note: r?.notes ?? "", updatedBy: r?.notes_updated_by ?? null, updatedByName: await nameOf(r?.notes_updated_by ?? null), updatedAt: r?.notes_updated_at ?? null };
    },
  });
  /** Saves the note; resolves with an error message or null. */
  const save = useCallback(async (text: string, userId: string): Promise<string | null> => {
    if (!id) return "No site.";
    const now = new Date().toISOString();
    const t = text.trim();
    if (kind === "terminal") {
      if (looksLikeAccountNumber(t)) return "That looks like an account number or code. Account numbers go in the supplier steps (company only). Terminal notes are shared with every company.";
      const { error } = await supabase.from("terminal_notes").upsert({ terminal_id: id, note: t, updated_by: userId, updated_at: now }, { onConflict: "terminal_id" });
      if (error) return error.message;
    } else {
      const { data, error } = await supabase.from("delivery_locations").update({ notes: t || null, notes_updated_by: userId, notes_updated_at: now, client_updated_at: now }).eq("location_id", id).select("location_id");
      if (error) return error.message;
      if (!data?.length) return "That note couldn't be saved. You may not have access to this location.";
    }
    void qc.invalidateQueries({ queryKey: key });
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, kind, qc]);
  return { note: q.data ?? null, loading: q.isLoading, save };
}

/** Average time at a site (arrived to left) across the company's past visits; null until there are three. */
export function useSiteAverage(kind: SiteKind, id: string | null) {
  const q = useQuery({
    queryKey: ["siteAvg", kind, id], enabled: !!id, staleTime: 10 * 60_000,
    queryFn: async (): Promise<number | null> => {
      const { data } = kind === "terminal"
        ? await supabase.from("trip_pickups").select("arrived_at, left_at").eq("terminal_id", id!).eq("outcome", "loaded").not("left_at", "is", null).order("arrived_at", { ascending: false }).limit(60)
        : await supabase.from("trip_deliveries").select("arrived_at, left_at").eq("location_id", id!).eq("status", "complete").not("left_at", "is", null).order("arrived_at", { ascending: false }).limit(60);
      return averageMinutes(((data ?? []) as { arrived_at: string | null; left_at: string | null }[]).map((r) => ({ arrivedAt: r.arrived_at, leftAt: r.left_at })));
    },
  });
  return q.data ?? null;
}
