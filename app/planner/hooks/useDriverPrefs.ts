"use client";
// app/planner/hooks/useDriverPrefs.ts
//
// The driver's own caps (per compartment number) and CG follow the driver across trucks, trailers and phones; the trailer's
// safety cap stays with the trailer and limits them. Plans that come in without a cap (a new combo, a dispatched layout, a
// preset saved without one) pick the driver's caps up; whatever the driver sets or clears in the plan is remembered.
import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CompPlanInput, CompRow } from "../types";
import { applyCaps, DEFAULT_CG, dropCap, emptyPrefs, mergePrefs, readPrefs, sameCaps, writePrefsLocal, type DriverPrefs } from "../utils/driverPrefs";
import { fetchPrefs, pushPrefs } from "../utils/driverPrefsStore";

export function useDriverPrefs(i: {
  userId: string | null | undefined; authUserId: string | null | undefined; comboId: string | null | undefined;
  compPlan: Record<number, CompPlanInput>; setCompPlan: Dispatch<SetStateAction<Record<number, CompPlanInput>>>;
  cgSlider: number; setCgSlider: (v: number) => void; compartments: CompRow[];
}) {
  const { userId, authUserId, comboId, compPlan, setCompPlan, cgSlider, setCgSlider, compartments } = i;
  const [prefs, setPrefs] = useState<DriverPrefs | null>(null);
  const prefsRef = useRef<DriverPrefs>(emptyPrefs());
  const cgAppliedFor = useRef<string | null>(null);

  // Load: the phone's copy at once, then the server's if it is newer.
  useEffect(() => {
    if (!userId) { setPrefs(null); return; }
    const local = readPrefs(userId);
    prefsRef.current = local; setPrefs(local);
    cgAppliedFor.current = null;
    if (!authUserId || authUserId !== userId) return; // acting as another driver: their phone copy only
    let live = true;
    void fetchPrefs(authUserId).then((srv) => {
      if (!live || !srv || srv.savedAt <= prefsRef.current.savedAt) return;
      prefsRef.current = srv; writePrefsLocal(userId, srv); setPrefs(srv);
    });
    return () => { live = false; };
  }, [userId, authUserId]);

  // Caps: a compartment with a product and no cap of its own takes the driver's.
  const limits = (() => {
    const m: Record<number, number> = {};
    for (const c of compartments) { const l = Number(c.cap_gallons ?? c.max_gallons ?? 0); if (l > 0) m[c.comp_number] = l; }
    return m;
  })();
  useEffect(() => {
    if (!prefs || !compartments.length) return;
    setCompPlan((cur) => applyCaps(cur, prefs, limits));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, compPlan, compartments]);

  // The driver cleared a compartment's cap on purpose: forget it, so it isn't filled back in.
  useEffect(() => {
    if (!userId) return;
    const on = (e: Event) => {
      const comp = Number((e as CustomEvent).detail);
      if (!Number.isFinite(comp) || prefsRef.current.caps[comp] == null) return;
      const next = dropCap(prefsRef.current, comp, Date.now());
      prefsRef.current = next; writePrefsLocal(userId, next); setPrefs(next);
      if (authUserId && authUserId === userId) void pushPrefs(authUserId, next);
    };
    window.addEventListener("protankr:clearDriverCap", on);
    return () => window.removeEventListener("protankr:clearDriverCap", on);
  }, [userId, authUserId]);

  // CG: a fresh plan (CG still at the default) starts where the driver likes it, once per combo.
  useEffect(() => {
    if (!prefs || prefs.cg == null || !comboId || cgAppliedFor.current === comboId) return;
    cgAppliedFor.current = comboId;
    if (Math.abs(cgSlider - DEFAULT_CG) < 0.0005 && Math.abs(prefs.cg - DEFAULT_CG) >= 0.0005) setCgSlider(prefs.cg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, comboId]);

  // Remember what the driver sets, after a short quiet. Waits for the prefs to load so the default never overwrites them.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !prefs || !comboId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // A CG still at the default, with a different one on file and not yet applied for this combo, is the default talking.
      const cgSettled = cgAppliedFor.current === comboId;
      const next = mergePrefs(prefsRef.current, compPlan, cgSettled ? cgSlider : (prefsRef.current.cg ?? cgSlider), Date.now(), limits);
      if (sameCaps(next, prefsRef.current)) return;
      prefsRef.current = next; writePrefsLocal(userId, next);
      if (authUserId && authUserId === userId) void pushPrefs(authUserId, next);
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compPlan, cgSlider, userId, comboId, prefs]);
}
