"use client";
// hooks/useEquipment.ts
// Owns: equipment_combos fetch, selectedComboId, derived name maps, localStorage persistence.
// When setupSession is active:
//   - localStorage is skipped entirely (no read, no write)
//   - selectedComboId is derived from whichever combo has claimed_by === targetUserId
//   - primary equipment reads/writes go through /api/admin/setup

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { SetupSession } from "@/lib/setupSession";
import type { ComboRow } from "../types";
import {
  getPrimaryEquipment,
  setPrimaryTruck,
  removePrimaryTruck,
  setPrimaryTrailer,
  removePrimaryTrailer,
  getCurrentEquipment,
  setCurrentEquipmentProxy,
} from "@/lib/adminSetupClient";

// ─── Storage helpers (module-level, pure) ─────────────────────────────────────

function equipKey(userId: string) {
  return `protankr_equip_v1:${userId || "anon"}`;
}

function readPersistedEquip(key: string): { comboId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const comboId = String((parsed as any)?.comboId || "");
    return comboId ? { comboId } : null;
  } catch {
    return null;
  }
}

function writePersistedEquip(key: string, comboId: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ comboId }));
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEquipment(authUserId: string, setupSession?: SetupSession | null) {
  const effectiveUserId = setupSession?.targetUserId ?? authUserId;
  const isSetup = !!setupSession?.targetUserId;

  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState<string | null>(null);
  const [selectedComboId, setSelectedComboIdRaw] = useState("");

  const hydratedForKeyRef = useRef("");
  const hydratingRef = useRef(false);

  const anonKey = useMemo(() => equipKey("anon"), []);
  const userKey = useMemo(() => equipKey(authUserId), [authUserId]);
  const effectiveKey = authUserId ? userKey : anonKey;

  // In setup mode, wrap setSelectedComboId to skip localStorage writes
  const setSelectedComboId = useCallback((id: string) => {
    setSelectedComboIdRaw(id);
    if (!isSetup && id) {
      // Normal mode — persist to localStorage
      writePersistedEquip(anonKey, id);
      if (authUserId) writePersistedEquip(userKey, id);
    }
  }, [isSetup, authUserId, anonKey, userKey]);

  // ── Current held units (bobtail / trailer-only layer) ─────────────────────
  // Phase 2: a driver can hold a truck with no trailer (bobtail) or a trailer
  // with no truck. Source of truth is user_settings.current_truck_id /
  // current_trailer_id (server-side so a take-over victim's device reads it on
  // next load). A full pair still materializes an equipment_combos row and
  // drives selectedComboId exactly as before -- this layer only adds the
  // partial states.
  const [currentTruckId, setCurrentTruckId] = useState<string | null>(null);
  const [currentTrailerId, setCurrentTrailerId] = useState<string | null>(null);
  const [currentTruckName, setCurrentTruckName] = useState<string | null>(null);
  const [currentTrailerName, setCurrentTrailerName] = useState<string | null>(null);
  // Ref to fetchCombos (defined below) so the writer can refresh without a
  // temporal-dead-zone reference in its dependency array.
  const fetchCombosRef = useRef<(() => Promise<void>) | null>(null);

  const loadCurrentEquipment = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      if (isSetup) {
        const { currentTruckId: t, currentTrailerId: tr } = await getCurrentEquipment(effectiveUserId);
        setCurrentTruckId(t ?? null);
        setCurrentTrailerId(tr ?? null);
      } else {
        const { data } = await supabase
          .from("user_settings")
          .select("current_truck_id, current_trailer_id")
          .eq("user_id", effectiveUserId)
          .maybeSingle();
        setCurrentTruckId((data as any)?.current_truck_id ?? null);
        setCurrentTrailerId((data as any)?.current_trailer_id ?? null);
      }
    } catch (e: any) {
      console.error("loadCurrentEquipment:", e?.message);
    }
  }, [effectiveUserId, isSetup]);

  // Writer: "I now hold exactly these units" (partial selection -- one non-null,
  // or both null to clear). A full pair goes through couple_combo, not this.
  const setCurrentEquipment = useCallback(async (truckId: string | null, trailerId: string | null) => {
    if (isSetup) {
      await setCurrentEquipmentProxy(effectiveUserId, truckId, trailerId);
    } else {
      const { error } = await supabase.rpc("set_current_equipment", {
        p_truck_id: truckId,
        p_trailer_id: trailerId,
      });
      if (error) throw error;
    }
    await Promise.all([fetchCombosRef.current?.(), loadCurrentEquipment()]);
  }, [isSetup, effectiveUserId, loadCurrentEquipment]);

  // ── Primary equipment (starred trucks/trailers) ───────────────────────────

  const [primaryTruckIds, setPrimaryTruckIds] = useState<Set<string>>(new Set());
  const [primaryTrailerIds, setPrimaryTrailerIds] = useState<Set<string>>(new Set());
  const primaryTruckIdsRef   = useRef<Set<string>>(new Set());
  const primaryTrailerIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { primaryTruckIdsRef.current   = primaryTruckIds;   }, [primaryTruckIds]);
  useEffect(() => { primaryTrailerIdsRef.current = primaryTrailerIds; }, [primaryTrailerIds]);

  const loadPrimaryEquipment = useCallback(async () => {
    if (!effectiveUserId) return;
    if (isSetup) {
      try {
        const { primaryTruckIds: tIds, primaryTrailerIds: trIds } =
          await getPrimaryEquipment(effectiveUserId);
        setPrimaryTruckIds(new Set(tIds));
        setPrimaryTrailerIds(new Set(trIds));
      } catch (e: any) {
        console.error("loadPrimaryEquipment (setup):", e?.message);
      }
    } else {
      const [{ data: pt }, { data: ptr }] = await Promise.all([
        supabase.from("user_primary_trucks").select("truck_id").eq("user_id", effectiveUserId),
        supabase.from("user_primary_trailers").select("trailer_id").eq("user_id", effectiveUserId),
      ]);
      setPrimaryTruckIds(new Set((pt ?? []).map((r: any) => String(r.truck_id))));
      setPrimaryTrailerIds(new Set((ptr ?? []).map((r: any) => String(r.trailer_id))));
    }
  }, [effectiveUserId, isSetup]);

  const togglePrimaryTruck = useCallback(async (truckId: string) => {
    if (!effectiveUserId) return;
    const isStarred = primaryTruckIdsRef.current.has(truckId);
    setPrimaryTruckIds((prev) => { const n = new Set(prev); isStarred ? n.delete(truckId) : n.add(truckId); return n; });
    if (isSetup) {
      try {
        if (isStarred) await removePrimaryTruck(effectiveUserId, truckId);
        else           await setPrimaryTruck(effectiveUserId, truckId);
      } catch (e: any) { console.error("togglePrimaryTruck (setup):", e?.message); }
    } else {
      if (isStarred) {
        await supabase.from("user_primary_trucks").delete().eq("user_id", effectiveUserId).eq("truck_id", truckId);
      } else {
        await supabase.from("user_primary_trucks").upsert({ user_id: effectiveUserId, truck_id: truckId }, { onConflict: "user_id,truck_id" });
      }
    }
  }, [effectiveUserId, isSetup]);

  const togglePrimaryTrailer = useCallback(async (trailerId: string) => {
    if (!effectiveUserId) return;
    const isStarred = primaryTrailerIdsRef.current.has(trailerId);
    setPrimaryTrailerIds((prev) => { const n = new Set(prev); isStarred ? n.delete(trailerId) : n.add(trailerId); return n; });
    if (isSetup) {
      try {
        if (isStarred) await removePrimaryTrailer(effectiveUserId, trailerId);
        else           await setPrimaryTrailer(effectiveUserId, trailerId);
      } catch (e: any) { console.error("togglePrimaryTrailer (setup):", e?.message); }
    } else {
      if (isStarred) {
        await supabase.from("user_primary_trailers").delete().eq("user_id", effectiveUserId).eq("trailer_id", trailerId);
      } else {
        await supabase.from("user_primary_trailers").upsert({ user_id: effectiveUserId, trailer_id: trailerId }, { onConflict: "user_id,trailer_id" });
      }
    }
  }, [effectiveUserId, isSetup]);

  // ── Fetch combos ──────────────────────────────────────────────────────────

  const fetchCombos = useCallback(async () => {
    setCombosLoading(true);
    setCombosError(null);

    const res = await supabase
      .from("equipment_combos")
      .select(
        "combo_id, combo_name, truck_id, trailer_id, tare_lbs, target_weight, active, claimed_by, claimed_at, company_id"
      )
      .order("combo_name", { ascending: true })
      .order("combo_id",   { ascending: true })
      .limit(200);

    if (res.error) {
      setCombosError(res.error.message);
      setCombos([]);
    } else {
      setCombos(
        ((res.data ?? []) as any[]).filter((r) => r.active !== false) as ComboRow[]
      );
    }
    setCombosLoading(false);
  }, []);

  useEffect(() => { fetchCombos(); }, [fetchCombos]);
  useEffect(() => { fetchCombosRef.current = fetchCombos; }, [fetchCombos]);

  // Load primary + current equipment whenever effectiveUserId is ready
  useEffect(() => {
    if (effectiveUserId) {
      loadPrimaryEquipment();
      loadCurrentEquipment();
    }
  }, [effectiveUserId, loadPrimaryEquipment, loadCurrentEquipment]);

  // ── Selection logic ───────────────────────────────────────────────────────
  // Setup mode: derive from claimed_by on combos — no localStorage involved
  // Normal mode: restore from localStorage after combos load

  useEffect(() => {
    if (combosLoading) return;

    if (isSetup) {
      // Derive selection from whichever combo is claimed by the target user
      const claimed = combos.find(
        (c) => String(c.claimed_by ?? "") === String(effectiveUserId)
      );
      setSelectedComboIdRaw(claimed ? String(claimed.combo_id) : "");
      return;
    }

    // Normal mode — restore from localStorage
    if (hydratedForKeyRef.current === effectiveKey) return;

    hydratingRef.current = true;

    const fromUser = authUserId ? readPersistedEquip(userKey) : null;
    const fromAnon = readPersistedEquip(anonKey);
    const saved = fromUser ?? fromAnon;

    if (saved?.comboId) {
      const exists = combos.some(
        (c) => String(c.combo_id) === String(saved.comboId) && c.active !== false
      );
      setSelectedComboIdRaw(exists ? String(saved.comboId) : "");

      if (authUserId && !fromUser && fromAnon) {
        writePersistedEquip(userKey, fromAnon.comboId);
      }
    }

    hydratedForKeyRef.current = effectiveKey;
    hydratingRef.current = false;
  }, [combosLoading, combos, isSetup, effectiveUserId, authUserId, effectiveKey, userKey, anonKey]);

  // Re-derive setup selection whenever combos refresh (e.g. after claim/slip seat)
  useEffect(() => {
    if (!isSetup || combosLoading) return;
    const claimed = combos.find(
      (c) => String(c.claimed_by ?? "") === String(effectiveUserId)
    );
    setSelectedComboIdRaw(claimed ? String(claimed.combo_id) : "");
  }, [combos, isSetup, effectiveUserId, combosLoading]);

  // Cross-device / post-take-over fallback: if nothing is selected locally but
  // the server says this user holds a FULL pair (both current_* set), resolve
  // it to the matching active combo. Never overrides an existing selection, so
  // it can't fight the localStorage/claimed_by paths above.
  useEffect(() => {
    if (combosLoading) return;
    if (selectedComboId) return;
    if (!currentTruckId || !currentTrailerId) return;
    const match = combos.find(
      (c) =>
        String(c.truck_id ?? "") === String(currentTruckId) &&
        String(c.trailer_id ?? "") === String(currentTrailerId) &&
        String(c.claimed_by ?? "") === String(effectiveUserId)
    );
    if (match) setSelectedComboIdRaw(String(match.combo_id));
  }, [combosLoading, selectedComboId, currentTruckId, currentTrailerId, combos, effectiveUserId]);

  // Resolve display names for the currently-held units (a bobtail truck has no
  // active combo, so truckNameById/trailerNameById below won't cover it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (currentTruckId) {
        const { data } = await supabase.from("trucks").select("truck_name").eq("truck_id", currentTruckId).maybeSingle();
        if (!cancelled) setCurrentTruckName((data as any)?.truck_name ?? null);
      } else if (!cancelled) setCurrentTruckName(null);
      if (currentTrailerId) {
        const { data } = await supabase.from("trailers").select("trailer_name").eq("trailer_id", currentTrailerId).maybeSingle();
        if (!cancelled) setCurrentTrailerName((data as any)?.trailer_name ?? null);
      } else if (!cancelled) setCurrentTrailerName(null);
    })();
    return () => { cancelled = true; };
  }, [currentTruckId, currentTrailerId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  // Partial (no materialized combo) states. When a full combo is selected these
  // are both false -- the current_* columns are subsumed by the combo.
  const isBobtail     = !selectedComboId && !!currentTruckId  && !currentTrailerId;
  const isTrailerOnly = !selectedComboId && !!currentTrailerId && !currentTruckId;

  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId]
  );

  const truckNameById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of combos) {
      const tid = String(c.truck_id ?? "").trim();
      if (!tid || out[tid]) continue;
      const name = String(c.combo_name ?? "").trim();
      out[tid] = name ? (name.split("/")[0]?.trim() || `Truck …${tid.slice(-6)}`) : `Truck …${tid.slice(-6)}`;
    }
    return out;
  }, [combos]);

  const trailerNameById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const c of combos) {
      const tid = String(c.trailer_id ?? "").trim();
      if (!tid || out[tid]) continue;
      const name = String(c.combo_name ?? "").trim();
      out[tid] = name ? (name.split("/")[1]?.trim() || `Trailer …${tid.slice(-6)}`) : `Trailer …${tid.slice(-6)}`;
    }
    return out;
  }, [combos]);

  const equipmentLabel = useMemo(() => {
    if (!selectedCombo) return undefined;
    const name = String(selectedCombo.combo_name ?? "").trim();
    if (name) return name;
    const t  = truckNameById[selectedCombo.truck_id  ?? ""] ?? selectedCombo.truck_id  ?? "?";
    const tr = trailerNameById[selectedCombo.trailer_id ?? ""] ?? selectedCombo.trailer_id ?? "?";
    return `${t} / ${tr}`;
  }, [selectedCombo, truckNameById, trailerNameById]);

  // Memoized so this hook returns the SAME object reference across renders
  // where nothing it actually owns changed -- every field here already
  // comes from useState/useCallback/useMemo (each already correctly
  // reactive on its own), so this can only stabilize the wrapper's own
  // identity, never mask a real change. This matters because
  // CalculatorShellContext.tsx spreads this whole object into its own
  // (also memoized, see that file) context value -- without this, calling
  // useEquipment() fresh on every provider render would hand back a new
  // object every time regardless, defeating that outer memoization for
  // every one of this hook's consumers. Part of the 2026-08-31
  // performance pass (see CLAUDE.md).
  return useMemo(() => ({
    combos,
    combosLoading,
    combosError,
    selectedComboId,
    setSelectedComboId,
    selectedCombo,
    truckNameById,
    trailerNameById,
    equipmentLabel,
    fetchCombos,
    primaryTruckIds,
    primaryTrailerIds,
    loadPrimaryEquipment,
    togglePrimaryTruck,
    togglePrimaryTrailer,
    // Phase 2 bobtail / current-units layer
    currentTruckId,
    currentTrailerId,
    currentTruckName,
    currentTrailerName,
    isBobtail,
    isTrailerOnly,
    setCurrentEquipment,
    loadCurrentEquipment,
  }), [
    combos, combosLoading, combosError, selectedComboId, setSelectedComboId,
    selectedCombo, truckNameById, trailerNameById, equipmentLabel, fetchCombos,
    primaryTruckIds, primaryTrailerIds, loadPrimaryEquipment, togglePrimaryTruck, togglePrimaryTrailer,
    currentTruckId, currentTrailerId, currentTruckName, currentTrailerName,
    isBobtail, isTrailerOnly, setCurrentEquipment, loadCurrentEquipment,
  ]);
}
