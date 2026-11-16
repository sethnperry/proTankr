"use client";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type UnitNotice = { action_id: string; unit_kind: "truck" | "trailer"; unit_name: string | null; actor_name: string | null; summary: string; created_at: string };

/** Admin changes to equipment this driver is using that they haven't acknowledged yet. Fails open (nothing shown). */
export function useUnitNotices(userId: string | null) {
  const qc = useQueryClient();
  const key = ["unitNotices", userId];
  const q = useQuery({
    queryKey: key, enabled: !!userId, staleTime: 60_000, refetchInterval: 2 * 60_000, refetchOnWindowFocus: true,
    queryFn: async (): Promise<UnitNotice[]> => {
      const { data, error } = await supabase.from("equipment_admin_actions").select("action_id, unit_kind, unit_name, actor_name, summary, created_at")
        .eq("holder_id", userId!).is("acknowledged_at", null).order("created_at", { ascending: false }).limit(10);
      return error ? [] : ((data ?? []) as UnitNotice[]);
    },
  });
  const ack = useCallback(async (id: string) => {
    qc.setQueryData<UnitNotice[]>(key, (old) => (old ?? []).filter((n) => n.action_id !== id));
    await supabase.rpc("ack_unit_notice", { p_id: id });
    void qc.invalidateQueries({ queryKey: key });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, userId]);
  return { items: q.data ?? [], ack };
}
