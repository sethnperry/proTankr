"use client";
// app/planner/hooks/planSlots/usePlanSlotsCore.ts
//
// State, keys, local storage access, snapshot build/apply.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLAN_SLOTS, UNIVERSAL_SCOPE, snapshotHasContent } from "../../utils/planSlotStorage";
import { serverFetchSlots as fetchServerSlots, serverUpsertSlot as upsertServerSlot } from "../../utils/planSlotServer";
import {
  fetchLastProductPerComp as fetchLastProduct,
  fetchLastLoadFromLog as fetchLastLoad,
  findLastLoadAtTerminalDifferentEquipment as findLastLoadElsewhere,
} from "../../utils/lastLoadLog";
import type { PlanSnapshot } from "../../types";

import type { Props } from "./types";

export function usePlanSlotsCore(props: Props) {
  const {
    authUserId,
    selectedTerminalId: selectedTerminalIdRaw,
    selectedComboId,
    tempF,
    compPlan,
    setCompPlan,
    cgSlider,
    setCgSlider,
    compartmentsLoaded,
    activeSlotLetter,
    onPlanRestored,
    onRestoreAttempted,
  } = props;

  // Plans are terminal-independent (see planScopeKey), so a missing terminal
  // must not switch the slot machinery off: the Plan page and the Plan Builder
  // run with no terminal selected. "__universal__" is only the label stored in
  // a snapshot's informational terminalId field.
  const selectedTerminalId = selectedTerminalIdRaw || UNIVERSAL_SCOPE;
  const activeSlotLetterRef = useRef<number | null | undefined>(activeSlotLetter);
  useEffect(() => {
    activeSlotLetterRef.current = activeSlotLetter;
  }, [activeSlotLetter]);
  const onPlanRestoredRef = useRef<typeof onPlanRestored>(onPlanRestored);
  useEffect(() => {
    onPlanRestoredRef.current = onPlanRestored;
  }, [onPlanRestored]);
  const onRestoreAttemptedRef = useRef<typeof onRestoreAttempted>(onRestoreAttempted);
  useEffect(() => {
    onRestoreAttemptedRef.current = onRestoreAttempted;
  }, [onRestoreAttempted]);

  const [slotBump, setSlotBump] = useState(0);
  const [slotHas, setSlotHas] = useState<Record<number, boolean>>({});
  // False until the initial server pull has genuinely completed for the
  // CURRENT equipment combo. Matters because PresetDial treats a tap on a
  // slot that reads as "empty" as an implicit save -- correct for a
  // genuinely empty slot, but destructive if it only *looks* empty because
  // the combo-scoped/legacy local caches haven't finished syncing from the
  // server yet (confirmed live: a tap during that window silently
  // overwrote a real, populated preset with whatever was on-screen at the
  // time, and synced that corruption up to the server too). Resets to
  // false on every combo change so a newly-selected combo can't be
  // interacted with until ITS OWN sync has completed.
  const [presetsReady, setPresetsReady] = useState(false);
  const presetsReadyForComboRef = useRef<string | null>(null);
  const [lastLoadLines, setLastLoadLines] = useState<any[]>([]);
  const [lastLoadReport, setLastLoadReport] = useState<{
    planned_total_gal: number;
    planned_gross_lbs: number | null;
    actual_gross_lbs: number | null;
    diff_lbs: number | null;
    completed_at: string | null;
    plan_slot: number | null;
  } | null>(null);

  const planRestoreReadyRef = useRef<string | null>(null);
  const planDirtyRef = useRef(false);
  const autosaveTimerRef = useRef<any>(null);
  // Tracks the most recent snapshot applySnapshot() has actually applied for
  // the CURRENT scope -- {scope, savedAt}, not just scope alone (see
  // applySnapshot's own comment for why savedAt matters here). Used as a
  // single, central guard against any automatic restore path (server pull
  // chief among them) silently regressing the live plan to older data than
  // what's already showing, regardless of which specific effect fired.
  const lastAppliedScopeRef = useRef<{ scope: string; savedAt: number } | null>(null);
  const serverSyncInFlightRef = useRef(false);
  const serverLastPulledScopeRef = useRef("");
  const serverWriteDebounceRef = useRef<any>(null);

  // ── Scope key ─────────────────────────────────────────────────────────────

  // Every plan slot -- slot 0 (the "live"/autosave plan) AND slots 1-5
  // (named A-E presets) -- is keyed per-user *and* per-equipment-combo,
  // deliberately WITHOUT a terminal component. Combo (not terminal) is what
  // actually determines compartment layout, so that's what a "plan" is
  // really scoped to. Slot 0 used to also include the terminal (see git
  // history) until explicit 2026-08-27 follow-up ("one setup persists
  // across all terminals," same decision already made for presets in the
  // original 2026-08-06 rework, now extended to the live plan too) -- the
  // old terminal-scoped design meant switching terminals silently swapped
  // in whatever THAT terminal's own separate old autosave draft happened to
  // be, discarding whatever the driver had just set up (including a preset
  // they'd just loaded). Falls back to "c:none" when combo hasn't resolved
  // yet (matches every other guard in this file that treats an unresolved
  // combo as "nothing to scope to yet").
  const planScopeKey = useMemo(() => {
    const who = authUserId ? `u:${authUserId}` : "anon";
    const combo = selectedComboId ? `c:${selectedComboId}` : "c:none";
    return `proTankr:${who}:${combo}`;
  }, [authUserId, selectedComboId]);

  const planStoreKey = useCallback((slot: number) => `${planScopeKey}:${slot === 0 ? "plan" : "preset"}:slot:${slot}`, [planScopeKey]);

  // Pre-equipment-scoping key (every preset used to live here, user-only,
  // shared across all equipment). Kept as a READ-ONLY fallback so existing
  // presets don't silently vanish for any combo that hasn't been
  // individually customized yet -- see readSlot below. Writes only ever go
  // to the new combo-specific key; this key is never written to again.
  const legacyPresetKey = useCallback(
    (slot: number) => {
      const who = authUserId ? `u:${authUserId}` : "anon";
      return `proTankr:${who}:preset:slot:${slot}`;
    },
    [authUserId],
  );

  const serverSyncEnabled = Boolean(authUserId);

  // ── Safe localStorage helpers ─────────────────────────────────────────────

  const safeRead = useCallback((key: string) => {
    try {
      return typeof window !== "undefined" ? JSON.parse(window.localStorage.getItem(key) ?? "null") : null;
    } catch {
      return null;
    }
  }, []);

  const safeWrite = useCallback((key: string, value: any) => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, []);

  const safeDelete = useCallback((key: string) => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } catch {}
  }, []);

  // Read a preset slot's raw payload, falling back to the pre-equipment-
  // scoping legacy key when this specific combo has never had that slot
  // saved yet. No implicit write-on-read -- once this combo's own key has
  // *any* value (including an explicit "cleared" marker written by
  // clearSlot below), the legacy fallback stops applying for it.
  const readSlot = useCallback(
    (slot: number) => {
      if (slot === 0) return safeRead(planStoreKey(0));
      return safeRead(planStoreKey(slot)) ?? safeRead(legacyPresetKey(slot));
    },
    [planStoreKey, legacyPresetKey, safeRead],
  );

  // ── Slot has map ──────────────────────────────────────────────────────────

  const refreshSlotHas = useCallback(() => {
    if (!selectedTerminalId) {
      setSlotHas({});
      setLastLoadLines([]);
      return;
    }
    // PLAN_SLOTS is always [1,2,3,4,5] -- slot 0 (autosave) never goes
    // through this map, so every slot here goes through readSlot's
    // combo-aware + legacy-fallback lookup.
    const next: Record<number, boolean> = {};
    for (const s of PLAN_SLOTS) next[s] = snapshotHasContent(readSlot(s));
    setSlotHas(next);
    // Read lastLoadLines from dedicated key (never clobbered by autosave)
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      const llData = safeRead(llKey) as any;
      const ll = llData?.lastLoadLines ?? [];
      setLastLoadLines(ll);
    }
  }, [selectedTerminalId, selectedComboId, authUserId, readSlot, safeRead]);

  // slotHas is a snapshot computed at call time, not a reactive derivation
  // -- it only gets recomputed where refreshSlotHas() is explicitly called
  // (save/clear/etc), never automatically when the underlying local cache
  // changes for some OTHER reason. The server pull effect below writes
  // fresh data into local storage asynchronously and bumps slotBump when
  // it does, but never itself called refreshSlotHas() -- so a slot whose
  // local cache was empty at mount (e.g. just cleared to fix a corrupted
  // entry) stayed marked "empty" in slotHas forever, even after the pull
  // populated it moments later with real data. Confirmed live: this made
  // PresetDial treat a genuinely-populated preset as empty, routing a tap
  // into save-over instead of load, on a slot whose local cache simply
  // hadn't been touched by anything else that already called
  // refreshSlotHas(). Recomputing whenever slotBump changes closes that
  // window -- slotHas now reflects reality as soon as the pull lands.
  useEffect(() => {
    refreshSlotHas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotBump]);
  // ── Server and load_log access ────────────────────────────────────────────
  // The calls live in utils/planSlotServer and utils/lastLoadLog; these bind them to
  // the current user, combo and terminal.
  const serverCtx = { authUserId, comboId: selectedComboId };
  const lastLoadCtx = { authUserId, comboId: selectedComboId, terminalId: selectedTerminalId, readSlot };
  const serverFetchSlots = () => fetchServerSlots(serverCtx);
  const serverUpsertSlot = (slot: number, payload: any) => upsertServerSlot(serverCtx, slot, payload);
  const fetchLastProductPerComp = (emptyComps: number[]) => fetchLastProduct(lastLoadCtx, emptyComps);
  const fetchLastLoadFromLog = (opts?: { terminalId?: string }) => fetchLastLoad(lastLoadCtx, opts);
  const findLastLoadAtTerminalDifferentEquipment = (terminalId: string) => findLastLoadElsewhere(lastLoadCtx, terminalId);

  // ── Snapshot build/apply ──────────────────────────────────────────────────

  // Named presets (slots 1-5) store the FULL compPlan -- product selection,
  // cgSlider (per explicit 2026-08-04 direction), AND each compartment's own
  // capOverride. capOverride used to be deliberately stripped here (the
  // original 2026-08-06 rework's "presets store only the product selection"
  // call), but per explicit 2026-08-27 follow-up ("my cap override should
  // also save") that's reversed too, same as the CG reversal before it --
  // a driver setting up a preset with a reduced fill level (e.g. for a
  // stale-API terminal) expects that cap to still be there next time they
  // tap that preset, not just the product. Slot 0 (the autosave/last-load
  // draft) already had full fidelity.
  // `name` is only ever passed through here as "whatever this slot's own
  // name already was" (see saveToSlot below) -- a normal save/edit never
  // invents or clears a name on its own, only renameSlot (which never
  // calls buildSnapshot at all) actually changes one.
  const buildSnapshot = useCallback(
    (terminalId: string, name?: string): PlanSnapshot => {
      return {
        v: 1,
        savedAt: Date.now(),
        terminalId,
        tempF: Number(tempF) || 60,
        cgSlider: Number(cgSlider),
        compPlan,
        ...(name ? { name } : {}),
        // Only meaningful for slot 0 (see PlanSnapshot's own comment) --
        // harmless on a named preset's own snapshot, which never reads it
        // back.
        activeSlot: activeSlotLetterRef.current ?? null,
      };
    },
    [tempF, cgSlider, compPlan],
  );

  // Single choke point every automatic AND explicit compPlan restore goes
  // through (restoreLivePlan, comboClaim's history pre-fill, the server
  // pull's cross-device merge, loadFromSlot, recallLastLoad) -- real bug
  // found while chasing a "plan toggles between the last two presets on
  // every refresh" report: several of these paths can independently decide
  // to restore SOME snapshot on mount, with no shared sense of "which one
  // actually reflects the most recent state" -- an automatic path (the
  // server pull's own cross-device merge in particular) could silently win
  // a race against an already-correct restore and regress the live plan to
  // older data.
  // `opts.force` is for the two genuinely explicit, user-initiated actions
  // (tapping a preset, tapping Recall Last Load) that are SUPPOSED to jump
  // back to older saved content on purpose -- staleness must never block
  // those. Returns whether the snapshot was actually applied, so a caller
  // that also wants to re-sync something else (e.g. the plan-letter
  // highlight) doesn't do so for a rejected, stale snapshot.
  const applySnapshot = useCallback(
    (snap: PlanSnapshot, opts?: { restoreCg?: boolean; force?: boolean }): boolean => {
      const incomingSavedAt = typeof snap?.savedAt === "number" ? snap.savedAt : 0;
      const prev = lastAppliedScopeRef.current;
      if (!opts?.force && prev && prev.scope === planScopeKey && incomingSavedAt > 0 && incomingSavedAt < prev.savedAt) {
        return false;
      }
      lastAppliedScopeRef.current = { scope: planScopeKey, savedAt: incomingSavedAt || Date.now() };
      // NOTE: tempF is intentionally NOT restored from any snapshot.
      // The fuel temp prediction always owns tempF. Restoring it from saved state
      // would override the prediction every time a slot is switched or the page reloads.
      setCompPlan(snap.compPlan || {});
      if (opts?.restoreCg && typeof snap.cgSlider === "number" && Number.isFinite(snap.cgSlider)) {
        setCgSlider(snap.cgSlider);
      }
      return true;
    },
    [setCompPlan, setCgSlider, planScopeKey],
  );

  // A new combo can't be trusted as "synced" just because a PREVIOUS combo
  // finished syncing -- reset immediately (synchronously) so there's no
  // window where the dial reads a stale "ready" from the old combo while
  // showing the new combo's (not-yet-pulled) local cache.
  useEffect(() => {
    setPresetsReady(false);
  }, [selectedComboId]);

  return {
    authUserId,
    selectedComboId,
    tempF,
    compPlan,
    cgSlider,
    compartmentsLoaded,
    selectedTerminalId,
    onPlanRestoredRef,
    onRestoreAttemptedRef,
    slotBump,
    setSlotBump,
    slotHas,
    presetsReady,
    setPresetsReady,
    presetsReadyForComboRef,
    lastLoadLines,
    setLastLoadLines,
    lastLoadReport,
    setLastLoadReport,
    planRestoreReadyRef,
    planDirtyRef,
    autosaveTimerRef,
    serverSyncInFlightRef,
    serverLastPulledScopeRef,
    serverWriteDebounceRef,
    planScopeKey,
    planStoreKey,
    legacyPresetKey,
    serverSyncEnabled,
    safeRead,
    safeWrite,
    safeDelete,
    readSlot,
    refreshSlotHas,
    serverFetchSlots,
    serverUpsertSlot,
    fetchLastProductPerComp,
    fetchLastLoadFromLog,
    findLastLoadAtTerminalDifferentEquipment,
    buildSnapshot,
    applySnapshot,
  };
}
