"use client";
// hooks/useEquipment.ts
// Owns: equipment_combos fetch, selectedComboId, derived name maps, localStorage persistence.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ComboRow } from "../types";

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

export function useEquipment(authUserId: string) {
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [combosLoading, setCombosLoading] = useState(true);
  const [combosError, setCombosError] = useState<string | null>(null);
  const [selectedComboId, setSelectedComboId] = useState("");

  const hydratedForKeyRef = useRef("");
  const hydratingRef = useRef(false);

  const anonKey = useMemo(() => equipKey("anon"), []);
  const userKey = useMemo(() => equipKey(authUserId), [authUserId]);
  const effectiveKey = authUserId ? userKey : anonKey;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCombos = useCallback(async () => {
    setCombosLoading(true);
    setCombosError(null);

    // Schema reality: no `coupled` column. "Coupled" = truck_id AND trailer_id both set.
    const res = await supabase
      .from("equipment_combos")
      .select(
        "combo_id, combo_name, truck_id, trailer_id, tare_lbs, gross_limit_lbs, buffer_lbs, active, claimed_by, claimed_at"
      )
      .order("combo_name", { ascending: true })
      .order("combo_id", { ascending: true })
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

  useEffect(() => {
    fetchCombos();
  }, [fetchCombos]);

  // ── Restore persisted selection (after combos load) ───────────────────────

  useEffect(() => {
    if (combosLoading) return;
    if (hydratedForKeyRef.current === effectiveKey) return;

    hydratingRef.current = true;

    const fromUser = authUserId ? readPersistedEquip(userKey) : null;
    const fromAnon = readPersistedEquip(anonKey);
    const saved = fromUser ?? fromAnon;

    if (saved?.comboId) {
      const exists = combos.some(
        (c) => String(c.combo_id) === String(saved.comboId) && c.active !== false
      );
      setSelectedComboId(exists ? String(saved.comboId) : "");

      // Migrate anon → user if needed
      if (authUserId && !fromUser && fromAnon) {
        writePersistedEquip(userKey, fromAnon.comboId);
      }
    }

    hydratedForKeyRef.current = effectiveKey;
    hydratingRef.current = false;
  }, [authUserId, effectiveKey, userKey, anonKey, combosLoading, combos]);

  // ── Persist on change ─────────────────────────────────────────────────────

  useEffect(() => {
    if (hydratedForKeyRef.current !== effectiveKey) return;
    if (hydratingRef.current) return;
    writePersistedEquip(anonKey, selectedComboId);
    if (authUserId) writePersistedEquip(userKey, selectedComboId);
  }, [authUserId, effectiveKey, userKey, anonKey, selectedComboId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedCombo = useMemo(
    () => combos.find((c) => String(c.combo_id) === String(selectedComboId)) ?? null,
    [combos, selectedComboId]
  );

  /**
   * Derive friendly truck/trailer display names from combo_name.
   * e.g. "25184 / 3151" → truck = "25184", trailer = "3151"
   * No separate trucks/trailers tables exist in v1.
   */
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
    const t = truckNameById[selectedCombo.truck_id ?? ""] ?? selectedCombo.truck_id ?? "?";
    const tr = trailerNameById[selectedCombo.trailer_id ?? ""] ?? selectedCombo.trailer_id ?? "?";
    return `${t} / ${tr}`;
  }, [selectedCombo, truckNameById, trailerNameById]);

  return {
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
  };
}
