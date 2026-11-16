"use client";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type Announcement = { id: string; subject: string; body: string; created_at: string };

/** Active announcements this person hasn't cleared, newest first. Fails open (nothing shown) on any error. */
export function useAnnouncements(userId: string | null) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["announcements", userId], enabled: !!userId, staleTime: 2 * 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: true,
    queryFn: async (): Promise<Announcement[]> => {
      // The server decides who each one is for (companies / roles) and leaves out what this person has cleared.
      const { data, error } = await supabase.rpc("my_announcements");
      if (error) return [];
      return (data ?? []) as Announcement[];
    },
  });
  const clear = useCallback(async (id: string) => {
    qc.setQueryData<Announcement[]>(["announcements", userId], (old) => (old ?? []).filter((x) => x.id !== id));
    await supabase.from("announcement_dismissals").upsert({ announcement_id: id, user_id: userId! }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
    void qc.invalidateQueries({ queryKey: ["announcements", userId] });
  }, [qc, userId]);
  return { items: q.data ?? [], clear };
}
