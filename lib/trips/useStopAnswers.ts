"use client";
// lib/trips/useStopAnswers.ts
//
// Answers the driver tapped on a stop notification ("Did you arrive?" / "Did you load here?")
// without opening the app. Oldest first. The dashboard applies each one (stamping the stop's own
// time, then asking only for the reason) and marks it applied.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type StopAnswer = {
  id: string; stop_at: string; kind: "arrive" | "hop"; place_name: string | null;
  answer: "arrived" | "delay" | "yes" | "no";
};

export function useStopAnswers(userId: string | null | undefined) {
  const [answers, setAnswers] = useState<StopAnswer[]>([]);
  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.from("stop_answers")
      .select("id, stop_at, kind, place_name, answer")
      .eq("user_id", userId).not("answer", "is", null).is("applied_at", null)
      .gte("stop_at", new Date(Date.now() - 48 * 3600_000).toISOString())
      .order("stop_at", { ascending: true }).limit(20);
    if (!error) setAnswers((data ?? []) as StopAnswer[]);
  }, [userId]);
  useEffect(() => {
    void load();
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(load, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.clearInterval(t); };
  }, [load]);
  const markApplied = useCallback(async (id: string) => {
    setAnswers((a) => a.filter((x) => x.id !== id));
    await supabase.from("stop_answers").update({ applied_at: new Date().toISOString() }).eq("id", id);
  }, []);
  return { answers, markApplied };
}
