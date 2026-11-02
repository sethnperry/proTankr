"use client";
// app/planner/hooks/useSafetyMeetings.ts
//
// The driver's view of safety meetings: the upcoming and open ones, which they have signed, and signing on
// screen. The rules are in lib/safety/safetyMeeting.ts.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { canSign, type Meeting } from "@/lib/safety/safetyMeeting";

export function useSafetyMeetings(userId: string | null, companyId: string | null, enabled: boolean) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId || !companyId) return;
    setLoading(true);
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const [m, s] = await Promise.all([
      supabase.from("safety_meetings").select("*").eq("company_id", companyId).gte("scheduled_for", since).is("closed_at", null).order("scheduled_for"),
      supabase.from("safety_meeting_signatures").select("meeting_id, signed_at").eq("user_id", userId),
    ]);
    setMeetings((m.data ?? []) as Meeting[]);
    setSigned(Object.fromEntries(((s.data ?? []) as { meeting_id: string; signed_at: string }[]).map((x) => [x.meeting_id, x.signed_at])));
    setLoading(false);
  }, [userId, companyId]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const sign = useCallback(async (m: Meeting, path: string): Promise<string | null> => {
    if (!userId || !companyId) return "Not signed in.";
    if (!canSign(m)) return "This meeting isn't open for sign-in.";
    const { error } = await supabase.from("safety_meeting_signatures").insert({ meeting_id: m.meeting_id, user_id: userId, company_id: companyId, signature: path });
    if (error) return error.code === "23505" ? null : "Couldn't save your signature. Check your signal and try again.";
    await load();
    return null;
  }, [userId, companyId, load]);

  const openMaterial = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("safety-meetings").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }, []);

  return { meetings, signed, loading, sign, openMaterial };
}
