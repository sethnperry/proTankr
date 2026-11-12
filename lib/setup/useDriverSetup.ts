"use client";
// lib/setup/useDriverSetup.ts
//
// The driver's setup checklist as a hook: loads the facts, computes the steps and counter, and reloads when
// the app comes back to the foreground (the driver leaves to fix something and returns).

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeSetup, type Confirmations, type SetupFacts, type SetupSummary, type StepId } from "./driverSetup";
import { confirmStep, loadSetup } from "./loadSetup";

export function useDriverSetup(userId: string | null | undefined, companyId: string | null | undefined, extraTerminalsStarred = 0) {
  const [data, setData] = useState<{ facts: SetupFacts; confirmations: Confirmations } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId || !companyId) return;
    setLoading(true);
    try { setData(await loadSetup(userId, companyId)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't load setup."); }
    finally { setLoading(false); }
  }, [userId, companyId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload]);

  const summary: SetupSummary | null = useMemo(() => (data ? computeSetup({ ...data.facts, terminalsStarred: Math.max(data.facts.terminalsStarred, extraTerminalsStarred) }, data.confirmations) : null), [data, extraTerminalsStarred]);

  const confirm = useCallback(async (step: StepId): Promise<string | null> => {
    if (!userId || !companyId) return "Not signed in.";
    const err = await confirmStep(userId, companyId, step);
    if (!err) setData((d) => (d ? { ...d, confirmations: { ...d.confirmations, [step]: new Date().toISOString() } } : d));
    return err;
  }, [userId, companyId]);

  return { summary, facts: data?.facts ?? null, loading, error, reload, confirm };
}
