// lib/dispatch/driverPlansIO.ts
//
// Database side of driverPlans.ts: find the driver's equipment pairing, read the
// plans saved for it, write one. Dispatch needs the staff access rule on
// user_plan_slots (migration 20261126000000) to read and write another user's rows.
import { supabase } from "@/lib/supabase/client";
import { readPresets, type PresetSummary } from "../trips/tripPlan.ts";
import { planSnapshot, saveErrorText, SLOTS, UNIVERSAL, type CompPlanLite } from "./driverPlans.ts";

export type PlanComp = { comp_number: number; max_gallons: number | null; cap_gallons: number | null };

/** The pairing (combo) of a truck and trailer: plans are saved per pairing. */
export async function comboFor(truckId: string | null, trailerId: string | null): Promise<string | null> {
  if (!truckId || !trailerId) return null;
  const { data } = await supabase.from("equipment_combos").select("combo_id").eq("truck_id", truckId).eq("trailer_id", trailerId).eq("active", true).limit(1);
  return ((data ?? [])[0] as any)?.combo_id ?? null;
}

export async function trailerComps(trailerId: string | null): Promise<PlanComp[]> {
  if (!trailerId) return [];
  const { data } = await supabase.from("trailer_compartments").select("comp_number, max_gallons, cap_gallons").eq("trailer_id", trailerId).order("comp_number");
  return ((data ?? []) as any[]).map((r) => ({ comp_number: Number(r.comp_number), max_gallons: r.max_gallons != null ? Number(r.max_gallons) : null, cap_gallons: r.cap_gallons != null ? Number(r.cap_gallons) : null }));
}

export async function loadDriverPlans(driverId: string, comboId: string | null, compNums: number[]): Promise<{ presets: PresetSummary[]; raw: Record<number, any> }> {
  const scoped: Record<number, any> = {}, legacy: Record<number, any> = {};
  if (comboId) {
    const { data } = await supabase.from("user_plan_slots").select("slot,payload").eq("user_id", driverId).eq("terminal_id", UNIVERSAL).eq("combo_id", comboId).in("slot", SLOTS);
    for (const r of (data ?? []) as any[]) scoped[Number(r.slot)] = r.payload;
  }
  const { data: old } = await supabase.from("user_plan_slots").select("slot,payload").eq("user_id", driverId).eq("terminal_id", UNIVERSAL).eq("combo_id", UNIVERSAL).in("slot", SLOTS);
  for (const r of (old ?? []) as any[]) legacy[Number(r.slot)] = r.payload;
  return { presets: readPresets(driverId, comboId, compNums, scoped, legacy), raw: { ...legacy, ...scoped } };
}

/** Saves a plan into one of the driver's slots. Returns an error message, or null. */
export async function saveDriverPlan(driverId: string, comboId: string, slot: number, compPlan: CompPlanLite, existing?: any): Promise<string | null> {
  const { error } = await supabase.from("user_plan_slots").upsert(
    { user_id: driverId, terminal_id: UNIVERSAL, combo_id: comboId, slot, payload: planSnapshot(compPlan, existing) },
    { onConflict: "user_id,terminal_id,combo_id,slot" },
  );
  return error ? saveErrorText(error.message) : null;
}

/** A compartment's safety cap lives on the trailer. Returns an error message, or null. */
export async function saveTrailerCaps(trailerId: string, changes: Record<number, number>): Promise<string | null> {
  for (const [n, cap] of Object.entries(changes)) {
    const { data, error } = await supabase.from("trailer_compartments").update({ cap_gallons: cap }).eq("trailer_id", trailerId).eq("comp_number", Number(n)).select("comp_number");
    if (error) return error.message;
    if (!data || data.length === 0) return "Not allowed to change this cap.";
  }
  return null;
}
