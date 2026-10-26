"use client";
// app/planner/hooks/planSlots/usePlanSlotsRestore.ts
//
// Restoring the live plan on combo change, dirty tracking, autosave and flush.

import { useEffect } from "react";
import type { PlanSnapshot } from "../../types";

import type { Props } from "./types";

import type { usePlanSlotsCore } from "./usePlanSlotsCore";

export function usePlanSlotsRestore(props: Props, k: ReturnType<typeof usePlanSlotsCore>) {
  const {
    authUserId,
    selectedComboId,
    tempF,
    compPlan,
    selectedTerminalId,
    onPlanRestoredRef,
    onRestoreAttemptedRef,
    setLastLoadLines,
    setLastLoadReport,
    planRestoreReadyRef,
    planDirtyRef,
    autosaveTimerRef,
    planScopeKey,
    planStoreKey,
    safeRead,
    safeWrite,
    refreshSlotHas,
    fetchLastLoadFromLog,
    buildSnapshot,
    applySnapshot,
  } = k;
  // ── On combo claim: fetch equipment-scoped last load from DB into local slot 0 ─

  // Load cached lastLoadLines immediately when comboId resolves (before DB fetch)
  useEffect(() => {
    if (!selectedComboId) {
      setLastLoadLines([]);
      return;
    }
    const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
    const llData = safeRead(llKey) as any;
    const ll = llData?.lastLoadLines ?? [];
    setLastLoadLines(ll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, authUserId]);

  useEffect(() => {
    if (!selectedComboId || !authUserId) return;
    (async () => {
      const dbPayload = await fetchLastLoadFromLog();
      if (!dbPayload) return;

      // Always update lastLoadLines — this is residue data, always current
      const llKey = `proTankr:${authUserId ? "u:" + authUserId : "anon"}:combo:${selectedComboId}:lastLoadLines`;
      safeWrite(llKey, { lastLoadLines: dbPayload.lastLoadLines, lastLoadId: dbPayload.lastLoadId });
      setLastLoadLines(dbPayload.lastLoadLines ?? []);
      setLastLoadReport(dbPayload.loadReport ?? null);

      // Only restore the plan (compPlan/temp/CG) if slot 0 is empty — i.e. fresh page load
      // with no autosaved state. If slot 0 has data the driver is mid-plan; don't clobber it.
      const localRaw = safeRead(planStoreKey(0));
      const slotIsEmpty = !localRaw || !localRaw.savedAt;
      if (slotIsEmpty) {
        safeWrite(planStoreKey(0), dbPayload);
        // restoreCg: true -- see CLAUDE.md "recap / recall last load": a
        // fresh mount/refresh should reproduce the last completed load
        // exactly, CG position included, not just the product selection.
        applySnapshot(dbPayload, { restoreCg: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, authUserId]);

  // ── Restore the live plan on combo change ─────────────────────────────────
  // Per explicit follow-up (reversing the original design below): a fresh
  // mount/refresh used to unconditionally discard any unfinalized WIP plan
  // for this combo, so the combo-claim effect above would see an empty
  // slot 0 and re-seed compPlan from the last COMPLETED load instead. In
  // real day-to-day use this meant setting up the NEXT load (a different
  // terminal, a different preset) and having a refresh silently snap back
  // to whatever was actually loaded last time -- the same "trust what was
  // there a moment ago" fix already applied to useLocation.ts's own
  // history override now applies here too: a saved local draft (raw) is
  // restored whenever one exists, refresh or not, mid-load or not. The
  // combo-claim effect only ever pre-fills from load history when slot 0
  // is genuinely empty (nothing here to lose), so a real WIP draft can
  // never get silently swapped out for stale history either way.
  //
  // Runs on COMBO change, not terminal change -- see planScopeKey's own
  // comment above. This used to re-run (and re-apply whatever local draft
  // was saved) on every terminal switch, which is exactly what silently
  // discarded a driver's current plan the moment they picked a different
  // terminal, since that terminal's own separately-scoped old draft (often
  // empty, or from unrelated earlier driving) would get force-applied over
  // it. Fixed 2026-08-27 by dropping terminal from this effect's scope
  // entirely, along with the terminalId-match guard that used to gate
  // whether `raw` applied at all -- slot 0 is combo-scoped now, so any real
  // saved draft for this combo is valid regardless of which terminal is
  // currently selected.

  useEffect(() => {
    if (!selectedComboId) return;
    const raw = safeRead(planStoreKey(0)) as PlanSnapshot | null;
    planRestoreReadyRef.current = planScopeKey;

    if (raw && raw.v === 1) {
      const applied = applySnapshot(raw);
      // A genuine local draft exists -- tell page.tsx so it can restore
      // the plan-letter highlight from THIS draft's own activeSlot
      // (whatever was actually on screen before the refresh) instead of
      // leaving that decision to the last-completed-load-based fallback
      // sync effect there, which has no idea a real draft just won.
      if (applied) onPlanRestoredRef.current?.(raw.activeSlot ?? null);
    }

    // Fires regardless of whether a real draft was found -- see this prop's
    // own comment on why page.tsx needs to know the attempt happened at
    // all, not just whether it succeeded.
    onRestoreAttemptedRef.current?.();

    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
    refreshSlotHas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, planScopeKey]);

  // ── Mark dirty on plan changes ────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTerminalId) return;
    if (planRestoreReadyRef.current) return;
    planDirtyRef.current = true;
  }, [selectedTerminalId, tempF, compPlan]);

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
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [selectedTerminalId, tempF, compPlan, buildSnapshot, planStoreKey, safeWrite, refreshSlotHas]);

  // ── Flush the pending autosave immediately on hide/unload ─────────────────
  // The 350ms debounce above is what made the "reload to the last
  // condition" fix intermittent in real use: a refresh landing inside that
  // window (change a plan, refresh almost immediately to check something)
  // fires before the setTimeout ever runs, so slot 0's last write is still
  // the PREVIOUS plan -- which then reads exactly like "sometimes only the
  // location restores, the plan reverts." visibilitychange (hidden) +
  // pagehide are the standard pair for "about to go away" on mobile, where
  // a plain unload/beforeunload listener isn't reliable -- same reasoning
  // useLocation.ts's own ambient-refresh heartbeat already uses.
  useEffect(() => {
    const flush = () => {
      if (!selectedTerminalId || !planDirtyRef.current) return;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      const snap = buildSnapshot(String(selectedTerminalId));
      safeWrite(planStoreKey(0), snap);
      planDirtyRef.current = false;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [selectedTerminalId, buildSnapshot, planStoreKey, safeWrite]);
}
