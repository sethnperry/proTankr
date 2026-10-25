"use client";
// app/planner/hooks/usePlannerEquipment.ts
//
// What the Planner reads about the selected truck and trailer: compartments, names and makes, and the saddle-tank size. Lifted out of PlannerHost unchanged.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { CompRow } from "../types";

export function usePlannerEquipment(equipment: { selectedCombo?: { truck_id?: string | null; trailer_id?: string | null } | null }) {
  const [compartments, setCompartments] = useState<CompRow[]>([]);
  const [compLoading, setCompLoading] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);

  const selectedTrailerId = equipment.selectedCombo?.trailer_id ?? null;

  useEffect(() => {
    (async () => {
      setCompError(null);
      setCompartments([]);
      if (!selectedTrailerId) return;
      setCompLoading(true);
      const { data, error } = await supabase
        .from("trailer_compartments")
        .select("trailer_id, comp_number, max_gallons, cap_gallons, position, active")
        .eq("trailer_id", selectedTrailerId)
        .order("comp_number", { ascending: true });
      if (error) { setCompError(error.message); setCompartments([]); }
      else { setCompartments(((data ?? []) as CompRow[]).filter((c) => c.active !== false)); }
      setCompLoading(false);
    })();
  }, [selectedTrailerId]);

  // ── Equipment details (truck/trailer name + make, for the Equipment info card) ──
  const [equipmentDetails, setEquipmentDetails] = useState({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
  const selectedTruckId = equipment.selectedCombo?.truck_id ?? null;

  useEffect(() => {
    (async () => {
      if (!selectedTruckId && !selectedTrailerId) {
        setEquipmentDetails({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
        return;
      }
      const [truckRes, trailerRes] = await Promise.all([
        selectedTruckId ? supabase.from("trucks").select("truck_name, make").eq("truck_id", selectedTruckId).maybeSingle() : Promise.resolve({ data: null }),
        selectedTrailerId ? supabase.from("trailers").select("trailer_name, make").eq("trailer_id", selectedTrailerId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setEquipmentDetails({
        truckName: (truckRes as any)?.data?.truck_name ?? "",
        truckMake: (truckRes as any)?.data?.make ?? "",
        trailerName: (trailerRes as any)?.data?.trailer_name ?? "",
        trailerMake: (trailerRes as any)?.data?.make ?? "",
      });
    })();
  }, [selectedTruckId, selectedTrailerId]);

  // ── Saddle-tank size for the Load Report's fuel-burn correction ──
  // Its own query, deliberately NOT added to the equipmentDetails select above:
  // if the fuel_tank_gallons migration hasn't run, a missing column 400s the
  // WHOLE query (this repo's stale-column bug class), which would blank the
  // truck name too. This one just fails to null.
  const [fuelTankGallons, setFuelTankGallons] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFuelTankGallons(null);
    if (!selectedTruckId) return;
    (async () => {
      const { data, error } = await supabase.from("trucks").select("fuel_tank_gallons").eq("truck_id", selectedTruckId).maybeSingle();
      if (cancelled || error) return;
      const v = Number((data as any)?.fuel_tank_gallons);
      setFuelTankGallons(Number.isFinite(v) && v > 0 ? v : null);
    })();
    return () => { cancelled = true; };
  }, [selectedTruckId]);

  const saveFuelTankGallons = useCallback(async (gallons: number) => {
    if (!selectedTruckId) throw new Error("No truck selected");
    // .select() so an RLS-filtered update (0 rows, no error) is caught instead
    // of looking like a save.
    const { data, error } = await supabase.from("trucks").update({ fuel_tank_gallons: gallons }).eq("truck_id", selectedTruckId).select("truck_id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("not allowed to edit this truck");
    setFuelTankGallons(gallons);
  }, [selectedTruckId]);

  return {
    compartments, setCompartments, compLoading, compError, selectedTrailerId,
    equipmentDetails, selectedTruckId, fuelTankGallons, saveFuelTankGallons,
  };
}
