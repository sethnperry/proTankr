"use client";
// hooks/usePlanSlots.ts
// Owns: plan snapshot save/load, localStorage hot cache, Supabase cross-device sync.
// Intentionally isolated — this is the most complex state machine in the app.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { biasToCgSlider } from "../utils/planMath";
import type { CompPlanInput, PlanSnapshot } from "../types";

const PLAN_SLOTS = [1, 2, 3, 4, 5] as const;

// ─── Payload parse (back-compat) ──────────────────────────────────────────────

function parsePlanPayload(raw: string | null, fallbackTerminalId: string, fallbackComboId: string): any {
  if (!raw) return null;
  try {
    const obj: any = JSON.parse(raw);
    // Real bug found while chasing an activeSlot/compPlan desync: this
    // function's own "is this legacy?" check was `obj.version == null` --
    // but the CURRENT format (buildSnapshot's own shape) has never had a
    // `version` field at all, only `v` (a different key). That check was
    // therefore true for every single current-format payload, silently
    // routing every one of them through the "legacy" reconstruction below
    // -- which only ever copies a fixed, old field list (terminalId/
    // tempF/cgSlider/compPlan) and drops anything else, including `v`,
    // `savedAt`, `name`, and this session's new `activeSlot`. This is the
    // ONE function both the local<->server sync pull AND the server
    // upload path go through, so it silently stripped those fields on
    // every cross-device round trip, independent of anything else. A
    // current-format object (`v: 1`) is already well-formed -- pass it
    // through as-is so every field, known or added later, survives.
    if (obj && typeof obj === "object" && obj.v === 1) {
      return obj;
    }
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
  // Real bug found while chasing the same activeSlot/compPlan desync as
  // parsePlanPayload's own fix above: this only ever compared the LEGACY
  // `savedAtISO` field. buildSnapshot (the only thing that writes local
  // OR uploads to the server today) has never set that field -- it sets
  // `savedAt`, a real numeric ms timestamp -- so both sides of this
  // comparison were silently always 0 for every current-format payload,
  // regardless of which one was actually more recent. That made
  // pullInto's "is the server's copy actually newer" check pure noise:
  // it could only ever return 0 (never > 0), so a server-side slot 0 row
  // could never lose an overwrite decision on its own merits, only via
  // the separate `!localHasRealContent` escape hatch. `savedAt` (numeric)
  // is preferred on both sides now, with `savedAtISO` kept only as a
  // fallback for genuinely old-format data that predates `savedAt`
  // existing at all.
  const at = typeof a?.savedAt === "number" ? a.savedAt : (a?.savedAtISO ? Date.parse(String(a.savedAtISO)) : 0);
  const bt = typeof b?.savedAt === "number" ? b.savedAt : (b?.savedAtISO ? Date.parse(String(b.savedAtISO)) : 0);
  return at - bt;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Sentinel scope used for every plan slot (0 through 5) so they're stored
// terminal-independent -- user_plan_slots.terminal_id/combo_id are NOT NULL
// text and part of the unique key, so a constant, non-null value here needs
// no schema migration and dedupes correctly (unlike NULL, which Postgres
// never treats as equal to itself for uniqueness). Originally only slots
// 1-5 (named presets) used this; slot 0 (the "live"/autosave plan) joined
// them 2026-08-27 ("one setup persists across all terminals" -- see
// planScopeKey's own comment below for the full story).
const UNIVERSAL_SCOPE = "__universal__";

type Props = {
  authUserId: string;
  selectedTerminalId: string;
  selectedComboId: string;
  tempF: number;
  compPlan: Record<number, CompPlanInput>;
  setCompPlan: (v: Record<number, CompPlanInput>) => void;
  cgSlider: number;
  setCgSlider: (v: number) => void;
  compartmentsLoaded: boolean;
  // Called by useLoadWorkflow after completeLoad — writes slot 0 as equipment-scoped
  onSaveLastLoad?: (payload: any) => Promise<void>;
  // page.tsx's activeSlotLetter -- read (via a ref, so the debounced
  // autosave never closes over a stale value) when writing slot 0's own
  // snapshot, so a refresh can restore the plan-letter highlight from
  // what was actually on screen instead of always deriving it from the
  // driver's last COMPLETED load (see the restore effect below).
  activeSlotLetter?: number | null;
  // Fired whenever slot 0 is restored from a genuine local draft (raw
  // exists) -- with that draft's own saved activeSlot (or null, if it was
  // a manually-edited plan with no preset tied to it). page.tsx uses this
  // to set activeSlotLetter/lastLoadedSlot AND to mark the one-shot
  // "already resolved" guard that otherwise lets the last-completed-load
  // fallback hijack the highlight. Never fired when slot 0 is genuinely
  // empty, so that fallback still gets to run for a brand-new combo.
  onPlanRestored?: (activeSlot: number | null) => void;
  // TEMPORARY (see dbg() below) -- receives the same one-line diagnostic
  // strings as the console.log calls, so page.tsx can render them
  // on-screen for a device where the console isn't reachable. Remove
  // alongside dbg() once the real cause is confirmed and fixed.
  onDebugLog?: (line: string) => void;
};

export function usePlanSlots({
  authUserId, selectedTerminalId, selectedComboId,
  tempF, compPlan,
  setCompPlan,
  cgSlider, setCgSlider,
  compartmentsLoaded,
  onSaveLastLoad,
  activeSlotLetter,
  onPlanRestored,
  onDebugLog,
}: Props) {
  const activeSlotLetterRef = useRef<number | null | undefined>(activeSlotLetter);
  useEffect(() => { activeSlotLetterRef.current = activeSlotLetter; }, [activeSlotLetter]);
  const onPlanRestoredRef = useRef<typeof onPlanRestored>(onPlanRestored);
  useEffect(() => { onPlanRestoredRef.current = onPlanRestored; }, [onPlanRestored]);
  const onDebugLogRef = useRef<typeof onDebugLog>(onDebugLog);
  useEffect(() => { onDebugLogRef.current = onDebugLog; }, [onDebugLog]);

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
    planned_total_gal: number; planned_gross_lbs: number | null; actual_gross_lbs: number | null; diff_lbs: number | null;
    completed_at: string | null; plan_slot: number | null;
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

  const planStoreKey = useCallback(
    (slot: number) => `${planScopeKey}:${slot === 0 ? "plan" : "preset"}:slot:${slot}`,
    [planScopeKey]
  );

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
    [authUserId]
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

  const safeDelete = useCallback((key: string) => {
    try { if (typeof window !== "undefined") window.localStorage.removeItem(key); }
    catch {}
  }, []);

  // ── TEMPORARY diagnostic logging ────────────────────────────────────────
  // Tracking down a reported "toggles between the last two plans on every
  // refresh" bug -- every place that can WRITE or RESTORE slot 0 logs a
  // compact one-line summary (which compartment holds which product +
  // which activeSlot letter) so the real sequence of events on a real
  // device can be read straight out of the browser console, instead of
  // guessed at from code alone. Remove once the real cause is confirmed
  // and fixed.
  function summarizeCompPlan(cp: any): string {
    if (!cp || typeof cp !== "object") return "(none)";
    return Object.keys(cp).sort((a, b) => Number(a) - Number(b))
      .map((k) => {
        const v = cp[k];
        const code = v?.empty || !v?.productId ? "MT" : String(v.productId).slice(0, 8);
        return `C${k}:${code}`;
      })
      .join(",") || "(empty)";
  }
  function dbg(label: string, extra: Record<string, any>) {
    try {
      // eslint-disable-next-line no-console
      console.log(
        `[planSlots] ${label}`,
        { scope: planScopeKey, combo: selectedComboId, ...extra }
      );
    } catch {}
    try {
      const parts = Object.entries(extra).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
      onDebugLogRef.current?.(`${label} ${parts}`);
    } catch {}
  }

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
    [planStoreKey, legacyPresetKey, safeRead]
  );

  // "Has real content" rather than "has a record at all" -- a slot that's
  // been explicitly cleared (see clearSlot) still has a record (an empty
  // marker, so the legacy fallback doesn't leak through) but should read as
  // unset for the dial's own has-data indicator.
  function snapshotHasContent(snap: any): boolean {
    if (!snap || snap.v !== 1 || !snap.compPlan || typeof snap.compPlan !== "object") return false;
    return Object.values(snap.compPlan).some((v: any) => v && !v.empty && v.productId);
  }

  // Same "does this have a real product selection" check, but for objects
  // coming out of parsePlanPayload -- which normalizes a locally-written
  // { v: 1, ... } entry into a DIFFERENT shape ({ version: 0, ... }, no `v`
  // field at all). snapshotHasContent's `snap.v !== 1` guard would reject
  // every one of those unconditionally, which isn't what "does the local
  // cache have real content" should mean here -- only compPlan itself
  // matters for this check.
  function hasRealCompPlan(obj: any): boolean {
    const cp = obj?.compPlan;
    if (!cp || typeof cp !== "object") return false;
    return Object.values(cp).some((v: any) => v && !(v as any).empty && (v as any).productId);
  }

  // ── Slot has map ──────────────────────────────────────────────────────────

  const refreshSlotHas = useCallback(() => {
    if (!selectedTerminalId) { setSlotHas({}); setLastLoadLines([]); return; }
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

  // ── Supabase server sync ──────────────────────────────────────────────────
  // Every slot (0 through 5) uses terminal_id = UNIVERSAL_SCOPE with a real
  // combo_id -- loadable/saveable from any terminal, but different equipment
  // (different compartment layouts) gets independent slots. Requires a
  // resolved combo to write to at all. See planScopeKey's own comment above
  // for why slot 0 joined slots 1-5 in dropping the terminal dimension
  // entirely (2026-08-27).

  function scopeFor(slot: number): { terminalId: string; comboId: string } | null {
    if (!selectedComboId) return null;
    return { terminalId: UNIVERSAL_SCOPE, comboId: String(selectedComboId) };
  }

  // Returns both the combo-scoped rows (preferred, post-rework -- covers
  // slot 0 and presets 1-5 in one query, since both now share the exact
  // same terminal_id=UNIVERSAL_SCOPE/combo_id shape) and the pre-equipment-
  // scoping legacy preset rows (terminal_id AND combo_id both
  // UNIVERSAL_SCOPE -- every preset lived here before the original
  // 2026-08-06 rework; slot 0 never had an equivalent legacy shape, since it
  // was always terminal+combo scoped until this same 2026-08-27 change, so
  // there's nothing to fall back to for it). The pull effect below writes
  // each into its own local cache; readSlot prefers the combo-scoped one and
  // only falls back to legacy (slots 1-5 only) for a combo that's never had
  // that slot saved under the new scheme.
  async function serverFetchSlots(): Promise<{ scoped: Record<number, any>; legacy: Record<number, any> }> {
    if (!authUserId) return { scoped: {}, legacy: {} };
    const scoped: Record<number, any> = {};
    const legacy: Record<number, any> = {};

    if (selectedComboId) {
      const { data, error } = await supabase
        .from("user_plan_slots")
        .select("slot,payload,updated_at")
        .eq("user_id", authUserId)
        .eq("terminal_id", UNIVERSAL_SCOPE)
        .eq("combo_id", String(selectedComboId))
        .in("slot", [0, 1, 2, 3, 4, 5]);
      if (error) console.warn("serverFetchSlots (combo-scoped) error:", error.message);
      else (data || []).forEach((r: any) => { scoped[Number(r.slot)] = r.payload ?? null; });
    }

    const { data: legacyRows, error: legacyErr } = await supabase
      .from("user_plan_slots")
      .select("slot,payload,updated_at")
      .eq("user_id", authUserId)
      .eq("terminal_id", UNIVERSAL_SCOPE)
      .eq("combo_id", UNIVERSAL_SCOPE)
      .in("slot", [1, 2, 3, 4, 5]);
    if (legacyErr) console.warn("serverFetchSlots (presets, legacy) error:", legacyErr.message);
    else (legacyRows || []).forEach((r: any) => { legacy[Number(r.slot)] = r.payload ?? null; });

    return { scoped, legacy };
  }

  async function serverUpsertSlot(slot: number, payload: any) {
    if (!authUserId) return;
    const scope = scopeFor(slot);
    if (!scope) return;
    const { error } = await supabase.from("user_plan_slots").upsert({
      user_id: authUserId, terminal_id: scope.terminalId,
      combo_id: scope.comboId, slot, payload,
    }, { onConflict: "user_id,terminal_id,combo_id,slot" });
    if (error) console.warn("serverUpsertSlot error:", error.message);
  }

  async function serverDeleteSlot(slot: number) {
    if (!authUserId) return;
    const scope = scopeFor(slot);
    if (!scope) return;
    const { error } = await supabase.from("user_plan_slots").delete()
      .eq("user_id", authUserId).eq("terminal_id", scope.terminalId)
      .eq("combo_id", scope.comboId).eq("slot", slot);
    if (error) console.warn("serverDeleteSlot error:", error.message);
  }

  // ── Last load from load_log (equipment-scoped, any driver on this combo sees it) ──
  // Reads planned_snapshot from the most recent completed load for this combo.
  // planned_snapshot.lines contains { comp_number, product_id, un_number, ... }
  // which is all we need to restore slot 0 and compute placard residue.

  // For each empty compartment, find the last product loaded into it for this combo.
  async function fetchLastProductPerComp(emptyComps: number[]): Promise<Record<number, { product_id: string; un_number: string | null }>> {
    if (!selectedComboId || emptyComps.length === 0) return {};

    // Step 1: get all completed load_ids for this combo, ordered newest first
    const { data: logRows, error: logErr } = await supabase
      .from("load_log")
      .select("load_id")
      .eq("combo_id", selectedComboId)
      .order("started_at", { ascending: false })
      .limit(50);

    if (logErr || !logRows?.length) return {};
    const loadIds = logRows.map((r: any) => r.load_id);

    // Step 2: for each empty comp, find the most recent load_line from those loads
    const result: Record<number, { product_id: string; un_number: string | null }> = {};

    await Promise.all(emptyComps.map(async (compNum) => {
      const { data, error } = await supabase
        .from("load_lines")
        .select("product_id, load_id, products(un_number)")
        .in("load_id", loadIds)
        .eq("comp_number", compNum)
        .gt("planned_gallons", 0)
        // Order by the position in loadIds array (newest load first)
        // We can't order by started_at here, so we fetch all and pick the one
        // whose load_id appears earliest in loadIds
        .limit(50);

      if (!error && data?.length) {
        // Pick the row whose load_id is earliest in loadIds (= most recent load)
        const sorted = data.sort((a: any, b: any) =>
          loadIds.indexOf(a.load_id) - loadIds.indexOf(b.load_id)
        );
        const best = sorted[0];
        if (best?.product_id) {
          result[compNum] = {
            product_id: String(best.product_id),
            un_number: (best.products as any)?.un_number ?? null,
          };
        }
      }
    }));

    return result;
  }

  // opts.terminalId scopes the search to a specific terminal -- used by
  // recallLastLoad (see its own comment) so "Recall Last Load" reproduces
  // the last load actually done AT THE CURRENTLY SELECTED TERMINAL, not
  // just the last load anywhere on this combo. The passive slip-seat
  // pre-fill (combo-claim effect) and refreshLastLoad (post-completion
  // residue refresh) both call this with no terminalId, unchanged --
  // those exist to answer "what's in this equipment right now," which is
  // legitimately terminal-independent.
  async function fetchLastLoadFromLog(opts?: { terminalId?: string }): Promise<any | null> {
    if (!selectedComboId) return null;

    // Only a genuinely finalized ("loaded") row counts -- an abandoned
    // "planned" row (LOAD tapped but never confirmed LOADED) must never be
    // treated as "the last load" for slip-seat pre-fill or the Target/
    // Actual/Diff summary. No fallback to "any status" on purpose.
    let query = supabase
      .from("load_log")
      .select("load_id, status, started_at, completed_at, terminal_id, planned_total_gal, planned_gross_lbs, diff_lbs, plan_slot, cg_bias")
      .eq("combo_id", selectedComboId)
      .eq("status", "loaded");
    if (opts?.terminalId) query = query.eq("terminal_id", opts.terminalId);
    const { data: comboRows, error: comboErr } = await query
      .order("started_at", { ascending: false })
      .limit(1);

    if (comboErr || !comboRows?.length) return null;
    const resolvedRow = comboRows[0];

    // Step 2: get load_lines for that load, joined with products for un_number
    const { data: lineRows, error: lineErr } = await supabase
      .from("load_lines")
      .select("comp_number, product_id, planned_gallons, actual_gallons, products(un_number, product_name, display_name)")
      .eq("load_id", resolvedRow.load_id);

    if (lineErr || !lineRows) return null;

    const lines = lineRows.map((l: any) => ({
      comp_number: Number(l.comp_number),
      product_id: l.product_id ? String(l.product_id) : null,
      un_number: l.products?.un_number ? String(l.products.un_number) : null,
      product_name: l.products?.product_name ?? l.products?.display_name ?? null,
      planned_gallons: Number(l.planned_gallons ?? 0),
      actual_gallons: l.actual_gallons != null ? Number(l.actual_gallons) : null,
    }));

    // Fallback compPlan reconstructed from load_lines, used only when the
    // load has no named preset attached (or that preset's own saved
    // content is gone). This is an APPROXIMATION, not the real plan --
    // pinning capOverride to whatever gallons a compartment actually ended
    // up with treats every compartment as capped, even ones that just
    // naturally allocated to that number with no real cap set at all.
    // Confirmed live: this is exactly what a second follow-up report
    // caught -- "every compartment has a cap" when Plan B really only
    // capped compartments 1 and 2. See below for the real fix.
    const fallbackCompPlan: Record<string, { empty: boolean; productId: string; capOverride?: number }> = {};
    for (const line of lines) {
      const n = String(line.comp_number ?? "");
      if (!n || !line.product_id) continue;
      const loadedGallons = line.actual_gallons ?? line.planned_gallons;
      fallbackCompPlan[n] = {
        empty: false,
        productId: line.product_id,
        ...(loadedGallons > 0 ? { capOverride: Math.round(loadedGallons) } : {}),
      };
    }

    // The REAL fix, per explicit follow-up ("the idea is to recall the
    // last load... exactly the way it was loaded using the same plan"):
    // load_log.plan_slot already records which named preset (1-5) was
    // active when this load began, and that preset -- assuming it hasn't
    // since been overwritten or cleared -- IS the exact plan that was
    // used, caps included (presets have saved full capOverride since the
    // 2026-08-27 fix). Reading it directly is exact, not an approximation
    // -- reconstructing per-compartment guesses from load_lines gallons
    // was always going to be wrong for any compartment that WASN'T
    // capped, since a natural allocation and a real cap produce
    // indistinguishable numbers after the fact.
    const presetSlot = (resolvedRow as any).plan_slot;
    let compPlan = fallbackCompPlan;
    if (typeof presetSlot === "number" && presetSlot >= 1 && presetSlot <= 5) {
      const presetSnap = readSlot(presetSlot) as PlanSnapshot | null;
      if (presetSnap && presetSnap.v === 1 && snapshotHasContent(presetSnap)) {
        compPlan = presetSnap.compPlan as any;
      }
    }


    // Payload utilization for this same load. Unlike points, this DOES have
    // its own row to read back (one per load), so it's a plain lookup rather
    // than a sum -- but the same "no row means null, not zero" rule applies:
    // a load the measurement never ran for is unmeasured, not 0% utilized.
    const { data: utilRow } = await supabase
      .from("load_utilization")
      .select("available_gallons, effective_available_gallons, actual_gallons, unused_gallons, utilization_pct, eligibility, exception_reason")
      .eq("load_id", resolvedRow.load_id)
      .maybeSingle();
    const utilization = utilRow ? {
      available_gallons: Number((utilRow as any).available_gallons ?? 0),
      effective_available_gallons: Number((utilRow as any).effective_available_gallons ?? 0),
      actual_gallons: Number((utilRow as any).actual_gallons ?? 0),
      unused_gallons: Number((utilRow as any).unused_gallons ?? 0),
      utilization_pct: (utilRow as any).utilization_pct != null ? Number((utilRow as any).utilization_pct) : null,
      eligibility: (utilRow as any).eligibility,
      exception_reason: (utilRow as any).exception_reason ?? null,
    } : null;

    const plannedGross = resolvedRow.planned_gross_lbs != null ? Number(resolvedRow.planned_gross_lbs) : null;
    const diff = resolvedRow.diff_lbs != null ? Number(resolvedRow.diff_lbs) : null;
    const loadReport = plannedGross != null && diff != null ? {
      planned_total_gal: Number(resolvedRow.planned_total_gal ?? 0),
      planned_gross_lbs: plannedGross,
      actual_gross_lbs: plannedGross + diff,
      diff_lbs: diff,
      completed_at: (resolvedRow as any).completed_at ?? null,
      plan_slot: (resolvedRow as any).plan_slot ?? null,
      utilization,
    } : null;

    // Real CG the driver actually used for this load, not a hardcoded
    // default -- see CLAUDE.md "recap / recall last load" discussion.
    // load_log.cg_bias is written at begin_load time (useLoadWorkflow.ts),
    // so it's the true value for this specific completed load -- but it's
    // the CONVERTED physics bias (cgSliderToBias's output, a nonlinear
    // curve roughly -1..2.5), not the raw 0-1 slider position. Feeding it
    // to the slider directly is a unit mismatch that sent the puck to a
    // clamped, "way off to unstable land" position -- confirmed live
    // (real cg_bias values like 1.5+ clamp a 0-1 range straight to 1,
    // full front, regardless of what the driver actually had it at).
    // biasToCgSlider is the inverse of that same conversion.
    const cgFromLoad = (resolvedRow as any).cg_bias;
    const cgSlider = typeof cgFromLoad === "number" && Number.isFinite(cgFromLoad) ? biasToCgSlider(cgFromLoad) : 0.5;

    return {
      v: 1,
      savedAt: resolvedRow.started_at ? new Date(resolvedRow.started_at).getTime() : Date.now(),
      terminalId: String((resolvedRow as any).terminal_id ?? selectedTerminalId ?? ""),
      tempF: 60,
      cgSlider,
      compPlan,
      lastLoadLines: lines,
      lastLoadId: resolvedRow.load_id,
      loadReport,
    };
  }

  // "Recall Last Load" is combo-scoped (see fetchLastLoadFromLog above) --
  // if the terminal's last load used DIFFERENT equipment than what's
  // currently selected, that combo-scoped query correctly finds nothing.
  // This is the follow-up lookup that answers the actual question a driver
  // is asking in that case: "did I load here before, just in something
  // else?" -- per explicit direction, scoped to THIS driver's own load
  // history (authUserId, which is effectiveUserId as passed into this
  // hook -- impersonation-safe), not any combo in the company; a "recall"
  // feature staying personal to the driver using it.
  //
  // PURELY INFORMATIONAL -- returns the load_id so the caller can link to
  // its read-only report view, nothing more. An earlier version of this
  // offered to directly CLAIM the other combo and switch to it -- reversed
  // per explicit follow-up: someone else could genuinely be running that
  // equipment right now, and claiming/decoupling it out from under them
  // just to satisfy a "let me peek at my last load" convenience is a real,
  // disruptive side effect, not something this feature should ever risk.
  // Nothing here claims equipment or changes state -- it's a pure read.
  async function findLastLoadAtTerminalDifferentEquipment(
    terminalId: string
  ): Promise<{ loadId: string; truckLabel: string; trailerLabel: string } | null> {
    if (!terminalId || !authUserId) return null;

    const { data: rows, error } = await supabase
      .from("load_log")
      .select("load_id, combo_id")
      .eq("user_id", authUserId)
      .eq("terminal_id", terminalId)
      .eq("status", "loaded")
      .order("started_at", { ascending: false })
      .limit(1);
    if (error || !rows?.length) return null;

    const loadId = rows[0].load_id ? String(rows[0].load_id) : "";
    const comboId = rows[0].combo_id ? String(rows[0].combo_id) : "";
    // Same equipment as what's already selected -- nothing "different" to
    // report; the normal recall already covers this case.
    if (!loadId || !comboId || comboId === selectedComboId) return null;

    const { data: comboRow } = await supabase
      .from("equipment_combos")
      .select("truck_id, trailer_id")
      .eq("combo_id", comboId)
      .maybeSingle();
    if (!comboRow) return null;

    const [truckRes, trailerRes] = await Promise.all([
      (comboRow as any).truck_id
        ? supabase.from("trucks").select("truck_name").eq("truck_id", (comboRow as any).truck_id).maybeSingle()
        : Promise.resolve({ data: null }),
      (comboRow as any).trailer_id
        ? supabase.from("trailers").select("trailer_name").eq("trailer_id", (comboRow as any).trailer_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      loadId,
      truckLabel: (truckRes.data as any)?.truck_name ?? "Truck",
      trailerLabel: (trailerRes.data as any)?.trailer_name ?? "Trailer",
    };
  }

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
        v: 1, savedAt: Date.now(), terminalId,
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
    [tempF, cgSlider, compPlan]
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
  // older data. `source` is a plain label for the debug log, not logic.
  // `opts.force` is for the two genuinely explicit, user-initiated actions
  // (tapping a preset, tapping Recall Last Load) that are SUPPOSED to jump
  // back to older saved content on purpose -- staleness must never block
  // those. Returns whether the snapshot was actually applied, so a caller
  // that also wants to re-sync something else (e.g. the plan-letter
  // highlight) doesn't do so for a rejected, stale snapshot.
  const applySnapshot = useCallback((snap: PlanSnapshot, opts?: { restoreCg?: boolean; source?: string; force?: boolean }): boolean => {
    const incomingSavedAt = typeof snap?.savedAt === "number" ? snap.savedAt : 0;
    const prev = lastAppliedScopeRef.current;
    if (!opts?.force && prev && prev.scope === planScopeKey && incomingSavedAt > 0 && incomingSavedAt < prev.savedAt) {
      dbg("applySnapshot:REJECTED (stale)", {
        source: opts?.source ?? "?", incomingSavedAt, prevSavedAt: prev.savedAt,
        rejectedCompPlan: summarizeCompPlan(snap.compPlan),
      });
      return false;
    }
    dbg("applySnapshot", {
      source: opts?.source ?? "?", savedAt: incomingSavedAt,
      compPlan: summarizeCompPlan(snap.compPlan), activeSlot: snap.activeSlot ?? null,
    });
    lastAppliedScopeRef.current = { scope: planScopeKey, savedAt: incomingSavedAt || Date.now() };
    // NOTE: tempF is intentionally NOT restored from any snapshot.
    // The fuel temp prediction always owns tempF. Restoring it from saved state
    // would override the prediction every time a slot is switched or the page reloads.
    setCompPlan(snap.compPlan || {});
    if (opts?.restoreCg && typeof snap.cgSlider === "number" && Number.isFinite(snap.cgSlider)) {
      setCgSlider(snap.cgSlider);
    }
    return true;
  }, [setCompPlan, setCgSlider, planScopeKey]);

  // A new combo can't be trusted as "synced" just because a PREVIOUS combo
  // finished syncing -- reset immediately (synchronously) so there's no
  // window where the dial reads a stale "ready" from the old combo while
  // showing the new combo's (not-yet-pulled) local cache.
  useEffect(() => {
    setPresetsReady(false);
  }, [selectedComboId]);

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
            savedAt: typeof sp.savedAt === "number" ? sp.savedAt
              : sp.savedAtISO ? (Date.parse(String(sp.savedAtISO)) || Date.now()) : Date.now(),
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
          if (key === planStoreKey(0)) {
            dbg("serverPull:pullInto:slot0", {
              key, willOverwrite,
              localHasRealContent: !!localHasRealContent,
              localCompPlan: summarizeCompPlan(lp?.compPlan),
              localActiveSlot: lp?.activeSlot ?? null,
              serverCompPlan: summarizeCompPlan(sp?.compPlan),
              serverActiveSlot: sp?.activeSlot ?? null,
            });
          }
          if (willOverwrite) {
            try { localStorage.setItem(key, JSON.stringify(normalize(sp, selectedTerminalId))); setSlotBump((v) => v + 1); } catch {}
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

        const local0 = parsePlanPayload(
          typeof window !== "undefined" ? localStorage.getItem(planStoreKey(0)) : null,
          selectedTerminalId, selectedComboId
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

          dbg("serverPull:local0Apply", {
            safeToApply,
            planDirty: planDirtyRef.current,
            local0CompPlan: summarizeCompPlan(local0.compPlan),
            local0ActiveSlot: local0.activeSlot ?? null,
            local0SavedAt: local0.savedAt ?? null,
            liveCompPlanBefore: summarizeCompPlan(compPlan),
          });

          if (safeToApply) {
            // NOTE: tempF is intentionally NOT restored from snapshot.
            // The fuel temp prediction always dominates on load/refresh.
            // tempF is only ever set by the prediction hook or manually by the user.
            // cgSlider is likewise never restored -- see applySnapshot.
            const applied = applySnapshot(local0, { source: "serverPull:local0Apply" });
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

  // ── On combo claim: fetch equipment-scoped last load from DB into local slot 0 ─

  // Load cached lastLoadLines immediately when comboId resolves (before DB fetch)
  useEffect(() => {
    if (!selectedComboId) { setLastLoadLines([]); return; }
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
      dbg("comboClaim:lastCompletedLoad", {
        slotIsEmpty,
        localRawCompPlan: summarizeCompPlan(localRaw?.compPlan),
        localRawActiveSlot: localRaw?.activeSlot ?? null,
        dbPayloadCompPlan: summarizeCompPlan(dbPayload?.compPlan),
        dbPayloadPlanSlot: dbPayload?.loadReport?.plan_slot ?? null,
      });
      if (slotIsEmpty) {
        safeWrite(planStoreKey(0), dbPayload);
        // restoreCg: true -- see CLAUDE.md "recap / recall last load": a
        // fresh mount/refresh should reproduce the last completed load
        // exactly, CG position included, not just the product selection.
        applySnapshot(dbPayload, { restoreCg: true, source: "comboClaim:lastCompletedLoad" });
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

    dbg("restoreLivePlan", {
      hasRaw: !!raw, rawV: raw?.v ?? null,
      rawCompPlan: summarizeCompPlan(raw?.compPlan),
      rawActiveSlot: raw?.activeSlot ?? null,
    });

    if (raw && raw.v === 1) {
      const applied = applySnapshot(raw, { source: "restoreLivePlan" });
      // A genuine local draft exists -- tell page.tsx so it can restore
      // the plan-letter highlight from THIS draft's own activeSlot
      // (whatever was actually on screen before the refresh) instead of
      // leaving that decision to the last-completed-load-based fallback
      // sync effect there, which has no idea a real draft just won.
      if (applied) onPlanRestoredRef.current?.(raw.activeSlot ?? null);
    }

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
      dbg("autosave:debouncedWrite", {
        compPlan: summarizeCompPlan(snap.compPlan), activeSlot: snap.activeSlot ?? null,
      });
      safeWrite(planStoreKey(0), snap);
      planDirtyRef.current = false;
      refreshSlotHas();
    }, 350);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
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
      dbg("autosave:hideFlushWrite", {
        compPlan: summarizeCompPlan(snap.compPlan), activeSlot: snap.activeSlot ?? null,
      });
      safeWrite(planStoreKey(0), snap);
      planDirtyRef.current = false;
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [selectedTerminalId, buildSnapshot, planStoreKey, safeWrite]);

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

  // Every slot -- the live plan (0) and named presets (1-5) alike -- needs
  // only a resolved equipment combo now, not a terminal (see planScopeKey's
  // own comment above).
  function canUseSlot(_slot: number): boolean {
    return !!selectedComboId;
  }

  const saveToSlot = useCallback((slot: number) => {
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
  }, [selectedTerminalId, selectedComboId, buildSnapshot, safeWrite, planStoreKey, refreshSlotHas, readSlot]);

  // Renames a preset WITHOUT touching its saved plan -- deliberately never
  // calls buildSnapshot (which pulls the CURRENTLY LIVE compPlan/cgSlider/
  // tempF), only merges a new `name` into whatever that slot's own existing
  // snapshot already is. Requires the slot to already have real saved
  // content (readSlot returns something) -- an empty, never-saved slot has
  // nothing to attach a name to yet; save a plan into it first, per the
  // quick-pick list's own flow.
  const renameSlot = useCallback((slot: number, name: string) => {
    if (!canUseSlot(slot) || slot === 0) return;
    const existing = readSlot(slot) as PlanSnapshot | null;
    if (!existing || existing.v !== 1) return;
    const trimmed = name.trim();
    const next: PlanSnapshot = { ...existing, name: trimmed || undefined };
    safeWrite(planStoreKey(slot), next);
    afterLocalSlotWrite(slot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboId, readSlot, safeWrite, planStoreKey]);

  const clearSlot = useCallback((slot: number) => {
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
  }, [selectedTerminalId, selectedComboId, safeDelete, safeWrite, planStoreKey, refreshSlotHas]);

  const loadFromSlot = useCallback((slot: number) => {
    if (!canUseSlot(slot)) return;
    const raw = readSlot(slot) as PlanSnapshot | null;
    if (!raw || raw.v !== 1) return;
    // No terminal-match check -- every slot (0 through 5) is
    // terminal-independent by design (see planScopeKey's own comment), so
    // it loads regardless of which terminal is currently selected.
    planRestoreReadyRef.current = planScopeKey;
    // Named presets (1-5) snap the CG slider to whatever was saved with them;
    // slot 0 (autosave/last-load draft) never restores CG -- see applySnapshot.
    // force: true -- this is a deliberate, explicit "go back to this saved
    // plan" tap; it must never be blocked by the staleness guard just
    // because the preset's own savedAt is (usually) far older than
    // whatever's live right now.
    applySnapshot(raw, { restoreCg: slot !== 0, source: `loadFromSlot:${slot}`, force: true });
    queueMicrotask(() => {
      if (planRestoreReadyRef.current === planScopeKey) planRestoreReadyRef.current = null;
    });
  }, [selectedComboId, readSlot, applySnapshot, planScopeKey]);

  // Read-only peek at a slot's saved compPlan, for showing a real summary
  // (e.g. "Load Diesel, Regular") in the action sheet before committing to
  // load or overwrite it. Never mutates anything.
  const peekSlot = useCallback((slot: number): PlanSnapshot | null => {
    const raw = readSlot(slot) as PlanSnapshot | null;
    if (!raw || raw.v !== 1) return null;
    return raw;
  }, [readSlot]);

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
    applySnapshot(dbPayload, { restoreCg: true, source: "recallLastLoad", force: true });
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
    PLAN_SLOTS,
    slotHas,
    presetsReady,
    lastLoadLines,
    lastLoadReport,
    fetchLastProductPerComp,
    saveToSlot,
    clearSlot,
    loadFromSlot,
    peekSlot,
    renameSlot,
    refreshLastLoad,
    recallLastLoad,
    findLastLoadAtTerminalDifferentEquipment,
  };
}
