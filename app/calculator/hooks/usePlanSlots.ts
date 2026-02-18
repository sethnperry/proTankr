"use client";
// hooks/usePlanSlots.ts
// Owns: plan snapshot save/load, localStorage hot cache, Supabase cross-device sync.
// Intentionally isolated — this is the most complex state machine in the app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { CompPlanInput, PlanSnapshot } from "../types";

const PLAN_SLOTS = [1, 2, 3, 4, 5] as const;

// ─── Payload parse (back-compat) ──────────────────────────────────────────────

function parsePlanPayload(raw: string | null, fallbackTerminalId: string, fallbackComboId: string): any {
  if (!raw) return null;
  try {
    const obj: any = JSON.parse(raw);
    if (obj && typeof obj === "object" && obj.version == null) {
      return {
        version: 0, savedAtISO: "",
        terminalId: fallbackTerminalId,
        comboId: fallbackComboId,
        tempF: typeof obj.tempF === "number" ? obj.tempF : undefined,
        cgSlider: typeof obj.cgSlider === "number" ? obj.cgSlider : undefined,
        compPlan: obj.compPlan ?? undefined,
      };
    }
    return obj;
  } catch {
    return null;
  }
}

function compareSavedAt(a: any, b: any): number {
  const at = a?.savedAtISO ? Date.parse(String(a.savedAtISO)) : 0;
  const bt = b?.savedAtISO ? Date.parse(String(b.savedAtISO)) : 0;
  return at - bt;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type Props = {
  authUserId: string;
  selectedTerminalId: string;
  selectedComboId: string;
  tempF: number;
  cgSlider: number;
  compPlan: Record<number, CompPlanInput>;
  setTempF: (v: number) => void;
  setCgSlider: (v: number) => void;
  setCompPlan: (v: Record<number, CompPlanInput>) => void;
  compartmentsLoaded: boolean;
};

export function usePlanSlots({
  authUserId, selectedTerminalId, selectedComboId,
  tempF, cgSlider, compPlan,
  setTempF, setCgSlider, setCompPlan,
  compartmentsLoaded,
}: Props) {
  const [slotBump, setSlotBump] = useState(0);
  const [slotHas, setSlotHas] = useState<Record<number, boolean>>({});

  const planRestoreReadyRef = useRef<string | null>(null);
  const planDirtyRef = useRef(false);
  const autosaveTimerRef = useRef<any>(null);
  const lastAppliedScopeRef = useRef("");
  const serverSyncInFlightRef = useRef(false);
  const serverLastPulledScopeRef = useRef("");
  const serverWriteDebounceRef = useRef<any>(null);

  // ── Scope key ─────────────────────────────────────────────────────────────

  const planScopeKey = useMemo(() => {
    const who = authUserId ? `u:${authUserId}` : "anon";
    const term = selectedTerminalId ? `t:${selectedTerminalId}` : "t:none";
    return `proTankr:${who}:${term}`;
  }, [authUserId, selectedTerminalId]);

  const planStoreKey = useCallback(
    (slot: number) => `${planScopeKey}:plan:slot:${slot}`,
    [planScopeKey]
  );

  const serverSyncEnabled = Boolean(authUserId);

  // ── Safe localStorage helpers ─────────────────────────────────────────────

  const safeRead = useCallback((key: string) => {
    try { return typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem(key) ?? "null") : null; }
    catch { return null; }
  }, []);

  const safeWrite = useCallback((key: string, value: any) => {
    try { if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }, []);

  // ── Slot has map ──────────────────────────────────────────────────────────

  const refreshSlotHas = useCallback(() => {
    if (!selectedTerminalId) { setSlotHas({}); return; }
    const next: Record<number, boolean> = {};
    for (const s of PLAN_SLOTS) next[s] = !!safeRead(planStoreKey(s));
    setSlotHas(next);
  }, [selectedTerminalId, planStoreKey, safeRead]);

  // ── Supabase server sync ──────────────────────────────────────────────────

  async function serverFetchSlots(): Promise<Record<number, any>> {
    if (!authUserId || !selectedTerminalId || !selectedComboId) return {};
    const { data, error } = await supabase
      .from("user_plan_slots")
      .select("slot,payload,updated_at")
      .eq("user_id", authUserId)
      .eq("terminal_id", String(selectedTerminalId))
      .eq("combo_id", String(selectedComboId))
      .in("slot", [0, 1, 2, 3, 4, 5]);
    if (error) { console.warn("serverFetchSlots error:", error.message); return {}; }
    const out: Record<number, any> = {};
    (data || []).forEach((r: any) => { out[Number(r.slot)] = r.payload ?? null; });
    return out;
  }

  async function serverUpsertSlot(slot: number, payload: any) {
    if (!authUserId || !selectedTerminalId || !selectedComboId) return;
    const { error } = await supabase.from("user_plan_slots").upsert({
      user_id: authUserId, terminal_id: String(selectedTerminalId),
      combo_id: String(selectedComboId), slot, payload,
    }, { onConflict: "user_id,terminal_id,combo_id,slot" });
    if (error) console.warn("serverUpsertSlot error:", error.message);
  }

  async function serverDeleteSlot(slot: number) {
    if (!authUserId || !selectedTerminalId || !selectedComboId) return;
    const { error } = await supabase.from("user_plan_slots").delete()
      .eq("user_id", authUserId).eq("terminal_id", String(selectedTerminalId))
      .eq("combo_id", String(selectedComboId)).eq("slot", slot);
    if (error) console.warn("serverDeleteSlot error:", error.message);
  }

  // ── Snapshot build/apply ──────────────────────────────────────────────────

  const buildSnapshot = useCallback(
    (terminalId: string): PlanSnapshot => ({
      v: 1, savedAt: Date.now(), terminalId,
      tempF: Number(tempF) || 60,
      cgSlider: Number(cgSlider) || 0.25,
      compPlan,
    }),
    [tempF, cgSlider, compPlan]
  );

  const applySnapshot = useCallback((snap: PlanSnapshot) => {
    setTempF(Number(snap.tempF) || 60);
    setCgSlider(Number(snap.cgSlider) || 0.25);
    setCompPlan(snap.compPlan || {});
  }, [setTempF, setCgSlider, setCompPlan]);

  // ── Server pull (once per scope) ──────────────────────────────────────────

  useEffect(() => {
    if (!serverSyncEnabled) return;
    if (!planScopeKey) return;
    if (!selectedTerminalId || !selectedComboId) return;
    if (serverSyncInFlightRef.current) return;
    if (serverLastPulledScopeRef.current === planScopeKey) return;

    serverSyncInFlightRef.current = true;
    (async () => {
      try {
        const server = await serverFetchSlots();
        for (const s of [0, 1, 2, 3, 4, 5]) {
          const sp = server[s];
          if (!sp) continue;
          const localRaw = typeof window !== "undefined" ? localStorage.getItem(planStoreKey(s)) : null;
          const lp = parsePlanPayload(localRaw, selectedTerminalId, selectedComboId);
          if (!lp || compareSavedAt(sp, lp) > 0) {
            try { localStorage.setItem(planStoreKey(s), JSON.stringify(sp)); setSlotBump((v) => v + 1); } catch {}
          }
        }

        const local0 = parsePlanPayload(
          typeof window !== "undefined" ? localStorage.getItem(planStoreKey(0)) : null,
          selectedTerminalId, selectedComboId
        );
        if (local0 && compartmentsLoaded) {
          const safeToApply =
            !planDirtyRef.current ||
            Object.keys(compPlan || {}).length === 0 ||
            lastAppliedScopeRef.current !== planScopeKey;

          if (safeToApply) {
            if (typeof local0.tempF === "number") setTempF(local0.tempF);
            if (typeof local0.cgSlider === "number") setCgSlider(local0.cgSlider);
            if (local0.compPlan && typeof local0.compPlan === "object") setCompPlan(local0.compPlan);
            planDirtyRef.current = false;
            lastAppliedScopeRef.current = planScopeKey;
          }
        }

        serverLastPulledScopeRef.current = planScopeKey;
      } finally {
        serverSyncInFlightRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSyncEnabled, planScopeKey, selectedTerminalId, selectedComboId, compartmentsLoaded, slotBump]);

  // ── Restore slot 0 on terminal change ─────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    const raw = safeRead(planStoreKey(0)) as PlanSnapshot | null;
    planRestoreReadyRef.current = planScopeKey;
    if (raw && raw.v === 1 && String(raw.terminalId) === String(selectedTerminalId)) {
      applySnapshot(raw);
    }
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
    refreshSlotHas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, planScopeKey]);

  // ── Mark dirty on plan changes ────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;
    planDirtyRef.current = true;
  }, [selectedTerminalId, tempF, cgSlider, compPlan]);

  // ── Debounced autosave slot 0 ─────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      if (!selectedTerminalId || !planDirtyRef.current) return;
      const snap = buildSnapshot(String(selectedTerminalId));
      safeWrite(planStoreKey(0), snap);
      planDirtyRef.current = false;
      refreshSlotHas();
    }, 350);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [selectedTerminalId, tempF, cgSlider, compPlan, buildSnapshot, planStoreKey, safeWrite, refreshSlotHas]);

  // ── Server sync helpers ───────────────────────────────────────────────────

  async function syncSlotToServer(slot: number) {
    if (!serverSyncEnabled) return;
    const payload = parsePlanPayload(
      typeof window !== "undefined" ? localStorage.getItem(planStoreKey(slot)) : null,
      selectedTerminalId, selectedComboId
    );
    if (!payload) return;
    await serverUpsertSlot(slot, payload);
  }

  async function afterLocalSlotWrite(slot: number) {
    if (!serverSyncEnabled) return;
    if (slot === 0) {
      if (serverWriteDebounceRef.current) clearTimeout(serverWriteDebounceRef.current);
      serverWriteDebounceRef.current = setTimeout(() => syncSlotToServer(0), 1200);
      return;
    }
    await syncSlotToServer(slot);
  }

  // ── Public save/load ──────────────────────────────────────────────────────

  const saveToSlot = useCallback((slot: number) => {
    if (!selectedTerminalId) return;
    const snap = buildSnapshot(String(selectedTerminalId));
    safeWrite(planStoreKey(slot), snap);
    refreshSlotHas();
    afterLocalSlotWrite(slot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTerminalId, buildSnapshot, safeWrite, planStoreKey, refreshSlotHas]);

  const loadFromSlot = useCallback((slot: number) => {
    if (!selectedTerminalId) return;
    const raw = safeRead(planStoreKey(slot)) as PlanSnapshot | null;
    if (!raw || raw.v !== 1) return;
    if (String(raw.terminalId) !== String(selectedTerminalId)) return;
    planRestoreReadyRef.current = planScopeKey;
    applySnapshot(raw);
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
  }, [selectedTerminalId, planStoreKey, safeRead, applySnapshot, planScopeKey]);

  return {
    PLAN_SLOTS,
    slotHas,
    saveToSlot,
    loadFromSlot,
  };
}
