"use client";
// app/planner/hooks/planSlots/usePlanSlotsSync.ts
//
// Server pull (once per scope) and writing a slot to the server.

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { parsePlanPayload, compareSavedAt, hasRealCompPlan } from "../../utils/planSlotStorage";

import type { Props } from "./types";

import type { usePlanSlotsCore } from "./usePlanSlotsCore";

export function usePlanSlotsSync(props: Props, k: ReturnType<typeof usePlanSlotsCore>) {
  const {
    selectedComboId,
    compPlan,
    compartmentsLoaded,
    selectedTerminalId,
    onPlanRestoredRef,
    slotBump,
    setSlotBump,
    setPresetsReady,
    presetsReadyForComboRef,
    planDirtyRef,
    serverSyncInFlightRef,
    serverLastPulledScopeRef,
    planScopeKey,
    planStoreKey,
    legacyPresetKey,
    serverSyncEnabled,
    serverFetchSlots,
    applySnapshot,
  } = k;
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
        const { scoped, legacy } = await serverFetchSlots();

        // Normalize into the same { v: 1, savedAt, ... } shape buildSnapshot
        // produces -- the server's own payload shape (version/savedAtISO) is
        // a different, older schema, and loadFromSlot only recognizes v:1.
        // Writing the raw server shape here made freshly-pulled slots (e.g.
        // a brand-new device, or any slot re-pulled after a local cache
        // clear) silently fail to load on tap until a save from that device
        // produced a compliant local entry.
        function normalize(sp: any, terminalIdFallback: string) {
          return {
            v: 1,
            // sp.savedAt (current-format, a real ms timestamp) now that
            // parsePlanPayload's upload path preserves it -- sp.savedAtISO
            // stays as a fallback for anything still uploaded in the old
            // reconstructed shape.
            savedAt:
              typeof sp.savedAt === "number" ? sp.savedAt : sp.savedAtISO ? Date.parse(String(sp.savedAtISO)) || Date.now() : Date.now(),
            terminalId: String(sp.terminalId ?? terminalIdFallback),
            tempF: typeof sp.tempF === "number" ? sp.tempF : 60,
            cgSlider: typeof sp.cgSlider === "number" ? sp.cgSlider : undefined,
            compPlan: sp.compPlan ?? {},
            // Preserved so a cross-device pull can't silently desync
            // slot 0's plan-letter highlight (activeSlot) or a named
            // preset's custom label (name) from whatever content this
            // same normalize() call is about to apply -- both used to
            // get dropped here even when the uploaded payload carried
            // them correctly (see parsePlanPayload's own comment).
            ...(sp.name ? { name: sp.name } : {}),
            activeSlot: sp.activeSlot ?? null,
          };
        }

        function pullInto(key: string, sp: any) {
          if (!sp) return;
          const localRaw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
          const lp = parsePlanPayload(localRaw, selectedTerminalId, selectedComboId);
          // compareSavedAt only has real signal when BOTH sides carry a real
          // savedAtISO -- but buildSnapshot (the only thing that writes
          // local data through this app's current code) never sets that
          // field at all, so parsePlanPayload always normalizes a
          // locally-written entry to savedAtISO:"". Comparing two blank
          // ISO strings returns 0 (not > 0), so the pull silently refused
          // to ever overwrite it -- confirmed live via diagnostic logging:
          // a slot whose local cache held stale, empty-content data from
          // a much earlier session stayed stuck on that data forever, even
          // though the server had real, correct, more recent content the
          // whole time. There's no real protection being lost by treating
          // a content-less local entry as always safe to replace -- it
          // can't represent meaningful unsynced user work if it has no
          // actual product selections in it.
          const localHasRealContent = lp && hasRealCompPlan(lp);
          const willOverwrite = !lp || !localHasRealContent || compareSavedAt(sp, lp) > 0;
          if (willOverwrite) {
            try {
              localStorage.setItem(key, JSON.stringify(normalize(sp, selectedTerminalId)));
              setSlotBump((v) => v + 1);
            } catch {}
          }
        }

        pullInto(planStoreKey(0), scoped[0]);
        for (const s of [1, 2, 3, 4, 5]) {
          // Combo-scoped (preferred) and legacy (fallback) are independent
          // local caches -- both get pulled so readSlot's fallback has
          // something to find even on a brand-new device that's never
          // cached anything locally yet.
          pullInto(planStoreKey(s), scoped[s]);
          pullInto(legacyPresetKey(s), legacy[s]);
        }

        // Plan slots dispatch set on this trailer fill any preset slot the
        // driver hasn't used. A driver's own save replaces it; one still
        // marked fromTrailer is refreshed when dispatch changes it.
        try {
          const { data: comboRow } = await supabase
            .from("equipment_combos")
            .select("trailer_id")
            .eq("combo_id", selectedComboId)
            .maybeSingle();
          const tid = (comboRow as any)?.trailer_id;
          if (tid) {
            const { data: trows } = await supabase.from("trailer_plan_slots").select("slot,name,payload,updated_at").eq("trailer_id", tid);
            for (const t of (trows ?? []) as any[]) {
              const slot = Number(t.slot);
              if (!(slot >= 1 && slot <= 5) || !hasRealCompPlan(t.payload)) continue;
              const key = planStoreKey(slot);
              const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
              let flagged: any = null;
              try {
                flagged = raw ? JSON.parse(raw) : null;
              } catch {}
              const own = parsePlanPayload(raw, selectedTerminalId, selectedComboId);
              const legacyOwn = parsePlanPayload(
                typeof window !== "undefined" ? localStorage.getItem(legacyPresetKey(slot)) : null,
                selectedTerminalId,
                selectedComboId,
              );
              const hasOwn = (own && hasRealCompPlan(own) && !flagged?.fromTrailer) || (legacyOwn && hasRealCompPlan(legacyOwn));
              const at = Date.parse(String(t.updated_at)) || Date.now();
              if (hasOwn) continue;
              if (flagged?.fromTrailer && Number(flagged.trailerAt) >= at) continue;
              localStorage.setItem(
                key,
                JSON.stringify({
                  v: 1,
                  savedAt: at,
                  terminalId: selectedTerminalId,
                  tempF: 60,
                  compPlan: t.payload.compPlan,
                  ...(t.name ? { name: t.name } : {}),
                  activeSlot: null,
                  fromTrailer: true,
                  trailerAt: at,
                }),
              );
              setSlotBump((v) => v + 1);
            }
          }
        } catch (e) {
          console.warn("trailer plan slots:", e);
        }

        const local0 = parsePlanPayload(
          typeof window !== "undefined" ? localStorage.getItem(planStoreKey(0)) : null,
          selectedTerminalId,
          selectedComboId,
        );
        if (local0 && compartmentsLoaded) {
          // Real bug this whole block used to cause: the "have we already
          // applied this scope" check below was a plain useRef("") that
          // ONLY this block itself ever set -- so on the very first server
          // pull for any given scope (i.e. every fresh mount), it always
          // read as "no," regardless of whether the "restore live plan on
          // combo change" effect had already correctly restored moments
          // earlier. That made this cross-device merge unconditionally
          // apply local0 over whatever was already live, every single
          // time -- exactly matching a real reported "plan toggles between
          // the last two presets on every refresh" bug. applySnapshot now
          // owns that "is this actually newer than what's already applied"
          // decision centrally (see its own comment), so this block no
          // longer needs its own scope-tracking at all -- only the
          // driver's own unsaved live edits (planDirtyRef) still gate
          // whether to even attempt the merge.
          const safeToApply = !planDirtyRef.current || Object.keys(compPlan || {}).length === 0;

          if (safeToApply) {
            // NOTE: tempF is intentionally NOT restored from snapshot.
            // The fuel temp prediction always dominates on load/refresh.
            // tempF is only ever set by the prediction hook or manually by the user.
            // cgSlider is likewise never restored -- see applySnapshot.
            const applied = applySnapshot(local0);
            if (applied) {
              planDirtyRef.current = false;
              // Cross-device sync can supersede whatever the "restore live
              // plan on combo change" effect already applied (e.g. this
              // device's own local cache was empty/stale, but another
              // device had pushed a newer plan to the server) -- without
              // this, the plan-letter highlight could keep showing whatever
              // an earlier restore/history-fallback step set, even after
              // THIS compPlan (from the server) became the live content.
              // Only re-synced when the snapshot actually applied -- never
              // for one applySnapshot correctly rejected as stale.
              onPlanRestoredRef.current?.(local0.activeSlot ?? null);
            }
          }
        }

        serverLastPulledScopeRef.current = planScopeKey;
        if (presetsReadyForComboRef.current !== selectedComboId) {
          presetsReadyForComboRef.current = selectedComboId;
          setPresetsReady(true);
        }
      } finally {
        serverSyncInFlightRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSyncEnabled, planScopeKey, selectedTerminalId, selectedComboId, compartmentsLoaded, slotBump]);
}
