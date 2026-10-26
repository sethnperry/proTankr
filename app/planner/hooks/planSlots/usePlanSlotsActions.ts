"use client";
// app/planner/hooks/planSlots/usePlanSlotsActions.ts
//
// Public actions: save, rename, clear, load, peek, last-load refresh and recall.

import { useCallback } from "react";
import { UNIVERSAL_SCOPE, parsePlanPayload } from "../../utils/planSlotStorage";
import type { CompPlanInput, PlanSnapshot } from "../../types";

import type { Props } from "./types";

import type { usePlanSlotsCore } from "./usePlanSlotsCore";

export function usePlanSlotsActions(props: Props, k: ReturnType<typeof usePlanSlotsCore>) {
  const {
    authUserId,
    selectedComboId,
    cgSlider,
    selectedTerminalId,
    setSlotBump,
    setLastLoadLines,
    setLastLoadReport,
    serverWriteDebounceRef,
    planStoreKey,
    serverSyncEnabled,
    safeWrite,
    safeDelete,
    readSlot,
    refreshSlotHas,
    serverUpsertSlot,
    fetchLastLoadFromLog,
    buildSnapshot,
    applySnapshot,
  } = k;
  // ── Server sync helpers ───────────────────────────────────────────────────

  async function syncSlotToServer(slot: number) {
    if (!serverSyncEnabled) return;
    const payload = parsePlanPayload(
      typeof window !== "undefined" ? localStorage.getItem(planStoreKey(slot)) : null,
      selectedTerminalId,
      selectedComboId,
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

  // Every slot -- the live plan (0) and named presets (1-5) alike -- needs
  // only a resolved equipment combo now, not a terminal (see planScopeKey's
  // own comment above).
  function canUseSlot(_slot: number): boolean {
    return !!selectedComboId;
  }

  const saveToSlot = useCallback(
    (slot: number) => {
      if (!canUseSlot(slot)) return;
      // Preserve whatever name this slot already had -- a normal save (tap
      // an empty slot, or "Edit Preset" re-saving the current plan) has no
      // reason to know or care about naming, and shouldn't silently clear an
      // existing one just by re-saving the plan content. Slot 0 has no name
      // concept at all, so this is skipped there.
      const existingName = slot !== 0 ? (readSlot(slot) as PlanSnapshot | null)?.name : undefined;
      const snap = buildSnapshot(String(selectedTerminalId), existingName);
      safeWrite(planStoreKey(slot), snap);
      refreshSlotHas();
      afterLocalSlotWrite(slot);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [selectedTerminalId, selectedComboId, buildSnapshot, safeWrite, planStoreKey, refreshSlotHas, readSlot],
  );

  // Writes an explicit plan to a slot (Plan Builder). Unlike saveToSlot this
  // does not read the live plan, so it can be called in the same tick the
  // wizard finishes. Optionally also makes it the live plan. Returns the
  // snapshot, or null when there is no combo to scope it to.
  const saveSnapshotToSlot = useCallback(
    (
      slot: number,
      input: { compPlan: Record<number, CompPlanInput>; cgSlider?: number; name?: string },
      opts?: { makeLive?: boolean },
    ): PlanSnapshot | null => {
      if (!canUseSlot(slot) || slot === 0) return null;
      const snap: PlanSnapshot = {
        v: 1,
        savedAt: Date.now(),
        terminalId: UNIVERSAL_SCOPE,
        tempF: 60,
        cgSlider: input.cgSlider ?? Number(cgSlider),
        compPlan: input.compPlan,
        ...(input.name ? { name: input.name } : {}),
      };
      safeWrite(planStoreKey(slot), snap);
      refreshSlotHas();
      afterLocalSlotWrite(slot);
      if (opts?.makeLive) applySnapshot(snap, { restoreCg: true, force: true });
      return snap;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [selectedComboId, cgSlider, safeWrite, planStoreKey, refreshSlotHas, applySnapshot],
  );

  // Renames a preset WITHOUT touching its saved plan -- deliberately never
  // calls buildSnapshot (which pulls the CURRENTLY LIVE compPlan/cgSlider/
  // tempF), only merges a new `name` into whatever that slot's own existing
  // snapshot already is. Requires the slot to already have real saved
  // content (readSlot returns something) -- an empty, never-saved slot has
  // nothing to attach a name to yet; save a plan into it first, per the
  // quick-pick list's own flow.
  const renameSlot = useCallback(
    (slot: number, name: string) => {
      if (!canUseSlot(slot) || slot === 0) return;
      const existing = readSlot(slot) as PlanSnapshot | null;
      if (!existing || existing.v !== 1) return;
      const trimmed = name.trim();
      const next: PlanSnapshot = { ...existing, name: trimmed || undefined };
      safeWrite(planStoreKey(slot), next);
      afterLocalSlotWrite(slot);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [selectedComboId, readSlot, safeWrite, planStoreKey],
  );

  const clearSlot = useCallback(
    (slot: number) => {
      if (!canUseSlot(slot)) return;
      if (slot === 0) {
        safeDelete(planStoreKey(slot));
      } else {
        // Write an explicit empty marker rather than deleting -- a bare
        // delete would just let the legacy fallback (readSlot) show back
        // through for a combo that's never had this slot customized, making
        // "Clear" look like it silently did nothing. Also syncs to the
        // server via the normal write path, so this combo is clear
        // cross-device too, without touching the legacy shared row (other,
        // not-yet-customized equipment keeps seeing it).
        safeWrite(planStoreKey(slot), { v: 1, savedAt: Date.now(), terminalId: UNIVERSAL_SCOPE, compPlan: {} });
        afterLocalSlotWrite(slot);
      }
      refreshSlotHas();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [selectedTerminalId, selectedComboId, safeDelete, safeWrite, planStoreKey, refreshSlotHas],
  );

  const loadFromSlot = useCallback(
    (slot: number) => {
      if (!canUseSlot(slot)) return;
      const raw = readSlot(slot) as PlanSnapshot | null;
      if (!raw || raw.v !== 1) return;
      // No terminal-match check -- every slot (0 through 5) is
      // terminal-independent by design (see planScopeKey's own comment), so
      // it loads regardless of which terminal is currently selected.
      //
      // Real, confirmed data-loss bug found via a live debug capture:
      // planRestoreReadyRef used to be set here too, exactly like
      // restoreLivePlan's own passive mount-time restore -- but that ref's
      // ENTIRE purpose (see the "Mark dirty on plan changes" and "Debounced
      // autosave" effects, its only two readers) is "this compPlan change is
      // just a restore of what's already saved, don't mark it dirty or
      // schedule a write." That's correct for restoreLivePlan (re-saving
      // identical data would be redundant) but wrong here: tapping a preset
      // is a deliberate action that's SUPPOSED to make this preset's content
      // the new live/autosave plan (slot 0) -- suppressing dirty-tracking
      // meant the tap visually applied the preset (compPlan updated
      // correctly on screen) but NEVER got written to slot 0 at all. The
      // next refresh then restored whatever slot 0 was last ACTUALLY saved
      // as -- which could be an entirely different, much older preset,
      // reproducing exactly as "refresh always returns to plan X no matter
      // what I'm working on" for however long ago X was last a dirty-
      // tracked write. Removed entirely -- this call now marks dirty and
      // autosaves like any other real compPlan change.
      // Named presets (1-5) snap the CG slider to whatever was saved with them;
      // slot 0 (autosave/last-load draft) never restores CG -- see applySnapshot.
      // force: true -- this is a deliberate, explicit "go back to this saved
      // plan" tap; it must never be blocked by the staleness guard just
      // because the preset's own savedAt is (usually) far older than
      // whatever's live right now.
      applySnapshot(raw, { restoreCg: slot !== 0, force: true });
    },
    [selectedComboId, readSlot, applySnapshot],
  );

  // Read-only peek at a slot's saved compPlan, for showing a real summary
  // (e.g. "Load Diesel, Regular") in the action sheet before committing to
  // load or overwrite it. Never mutates anything.
  const peekSlot = useCallback(
    (slot: number): PlanSnapshot | null => {
      const raw = readSlot(slot) as PlanSnapshot | null;
      if (!raw || raw.v !== 1) return null;
      return raw;
    },
    [readSlot],
  );

  // Public: refresh slot 0 from load_log after a completed load
  // Called by page.tsx post-completeLoad so slip seat state updates without reload
  const refreshLastLoad = useCallback(async () => {
    const dbPayload = await fetchLastLoadFromLog();
    if (!dbPayload) return;
    safeWrite(planStoreKey(0), dbPayload);
    // Write lastLoadLines to dedicated key and update state immediately
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      safeWrite(llKey, { lastLoadLines: dbPayload.lastLoadLines, lastLoadId: dbPayload.lastLoadId });
      setLastLoadLines(dbPayload.lastLoadLines ?? []);
    }
    refreshSlotHas();
    setSlotBump((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, selectedTerminalId, planStoreKey, safeWrite, refreshSlotHas]);

  // Public: "Recall Last Load" button (page.tsx) -- unlike the passive
  // mount-time restore above (which deliberately never clobbers an
  // existing slot-0 draft, so a driver's real in-progress work is never
  // silently discarded), this is a direct, explicit user request to throw
  // the current draft away and go back to the last real load. Applies the
  // DB snapshot live (compPlan + CG) immediately, unconditionally -- no
  // slotIsEmpty gate, no reload, and no dependency on the fresh-mount
  // ordering between this hook's own restore effects (those two effects
  // have independent trigger dependencies and can fire in either order;
  // a page reload was tried first and found to lose that race in
  // practice, live-verified before switching to this direct approach).
  //
  // Scoped to the CURRENTLY SELECTED terminal -- per explicit follow-up
  // ("if I tap recall last load, it should recall the last load for the
  // terminal selected"), not just the last load anywhere for this combo.
  // If this combo has never completed a load at this specific terminal,
  // this returns null (same silent no-op the caller already handles for
  // "no completed load at all") rather than falling back to some other
  // terminal's load.
  const recallLastLoad = useCallback(async () => {
    const dbPayload = await fetchLastLoadFromLog({ terminalId: selectedTerminalId || undefined });
    if (!dbPayload) return null;
    safeWrite(planStoreKey(0), dbPayload);
    if (selectedComboId) {
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      safeWrite(llKey, { lastLoadLines: dbPayload.lastLoadLines, lastLoadId: dbPayload.lastLoadId });
      setLastLoadLines(dbPayload.lastLoadLines ?? []);
    }
    // force: true -- this is the explicit "Recall Last Load" button, whose
    // own comment above already says it applies "unconditionally... no
    // slotIsEmpty gate" -- the staleness guard must not silently defeat
    // that by rejecting a past load's (usually much older) savedAt.
    applySnapshot(dbPayload, { restoreCg: true, force: true });
    const report = dbPayload.loadReport ?? null;
    setLastLoadReport(report);
    refreshSlotHas();
    // Returned (not just set on internal lastLoadReport state) because
    // page.tsx's loadWorkflow.loadReport -- what the recap card actually
    // renders -- is a SEPARATE piece of state in a different hook, synced
    // from lastLoadReport by a mount-time seed effect that's guarded to
    // only ever fire once (while loadReport is still null). By the time
    // this runs, loadReport is already set from before, so that seed
    // effect won't re-fire -- the caller has to push this report into
    // loadWorkflow directly.
    return report;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, selectedTerminalId, authUserId, planStoreKey, safeWrite, applySnapshot, refreshSlotHas]);

  return {
    saveToSlot,
    saveSnapshotToSlot,
    renameSlot,
    clearSlot,
    loadFromSlot,
    peekSlot,
    refreshLastLoad,
    recallLastLoad,
  };
}
