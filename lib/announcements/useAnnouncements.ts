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
      const [a, d] = await Promise.all([
        supabase.from("admin_announcements").select("id, subject, body, created_at").eq("active", true).order("created_at", { ascending: false }).limit(20),
        supabase.from("announcement_dismissals").select("announcement_id").eq("user_id", userId!),
      ]);
      if (a.error) return [];
      const gone = new Set(((d.data ?? []) as { announcement_id: string }[]).map((r) => r.announcement_id));
      return ((a.data ?? []) as Announcement[]).filter((x) => !gone.has(x.id));
    },
  });
  const clear = useCallback(async (id: string) => {
    qc.setQueryData<Announcement[]>(["announcements", userId], (old) => (old ?? []).filter((x) => x.id !== id));
    await supabase.from("announcement_dismissals").upsert({ announcement_id: id, user_id: userId! }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
    void qc.invalidateQueries({ queryKey: ["announcements", userId] });
  }, [qc, userId]);
  return { items: q.data ?? [], clear };
}
