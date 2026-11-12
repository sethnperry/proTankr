// lib/setup/loadSetup.ts
//
// Gathers the facts the setup checklist needs for one driver, as that driver (so row security applies), and
// their confirmations. Every read fails soft: a table that can't be read counts as "nothing there" rather than
// breaking the screen. Pure rules live in driverSetup.ts.

import { supabase } from "@/lib/supabase/client";
import { planHasProduct } from "./driverSetup";
import type { Confirmations, SetupFacts, StepId } from "./driverSetup";

const rows = async <T,>(q: PromiseLike<{ data: T[] | null }>): Promise<T[]> => {
  try { return (await q).data ?? []; } catch { return []; }
};
const one = async <T,>(q: PromiseLike<{ data: T | null }>): Promise<T | null> => {
  try { return (await q).data ?? null; } catch { return null; }
};

export async function loadSetup(userId: string, companyId: string): Promise<{ facts: SetupFacts; confirmations: Confirmations }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;

  const [company, profile, regions, areas, lic, med, sched, settings, combos, plans, terms, stars, methods, pin, push, home, vault, confs, tele] = await Promise.all([
    one<{ is_solo: boolean | null }>(supabase.from("companies").select("is_solo").eq("company_id", companyId).maybeSingle()),
    one<{ display_name: string | null; employee_number: string | null; region: string | null; local_area: string | null }>(
      supabase.from("profiles").select("display_name, employee_number, region, local_area").eq("user_id", userId).maybeSingle()),
    rows<{ region_id: string }>(supabase.from("equipment_regions").select("region_id").eq("company_id", companyId).eq("is_active", true).limit(1)),
    rows<{ local_area_id: string }>(supabase.from("equipment_local_areas").select("local_area_id").eq("company_id", companyId).eq("is_active", true).limit(1)),
    one<{ license_number: string | null; expiration_date: string | null }>(
      supabase.from("driver_licenses").select("license_number, expiration_date").eq("user_id", userId).limit(1).maybeSingle()),
    one<{ expiration_date: string | null }>(supabase.from("driver_medical_cards").select("expiration_date").eq("user_id", userId).limit(1).maybeSingle()),
    one<{ days_of_week: number[] | null }>(supabase.from("driver_schedules").select("days_of_week").eq("user_id", userId).eq("company_id", companyId).maybeSingle()),
    one<{ current_truck_id: string | null; current_trailer_id: string | null }>(
      supabase.from("user_settings").select("current_truck_id, current_trailer_id").eq("user_id", userId).maybeSingle()),
    rows<{ truck_id: string | null; trailer_id: string | null }>(
      supabase.from("equipment_combos").select("truck_id, trailer_id").eq("claimed_by", userId).eq("active", true).limit(1)),
    rows<{ slot: number; payload: unknown }>(supabase.from("user_plan_slots").select("slot, payload").eq("user_id", userId).gte("slot", 1).lte("slot", 26)),
    rows<{ terminal_id: string }>(supabase.from("my_terminals").select("terminal_id").eq("user_id", userId).eq("is_starred", true)),
    rows<{ location_id: string }>(supabase.from("delivery_location_stars").select("location_id").eq("user_id", userId)),
    rows<{ kind: string }>(supabase.from("fuel_payment_methods").select("kind").eq("company_id", companyId).eq("is_active", true).in("kind", ["rfid", "company_account"])),
    rows<{ method_id: string }>(supabase.from("driver_fuel_pins").select("method_id").eq("user_id", userId)),
    rows<{ endpoint: string }>(supabase.from("push_subscriptions").select("endpoint").eq("user_id", userId).limit(1)),
    one<{ city: string | null }>(supabase.from("per_diem_homes").select("city").eq("user_id", userId).maybeSingle()),
    one<{ user_id: string }>(supabase.from("user_vault_pin").select("user_id").eq("user_id", userId).maybeSingle()),
    rows<{ step: string; confirmed_at: string }>(supabase.from("driver_setup_confirmations").select("step, confirmed_at").eq("user_id", userId)),
    // Telematics tables are server-only, so ask the same endpoint the Hours screen uses.
    (async (): Promise<{ companyConnected?: boolean; connected?: boolean } | null> => {
      if (!token) return null;
      try {
        const r = await fetch(`/api/telematics/my-login?companyId=${encodeURIComponent(companyId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        return r.ok ? await r.json() : null;
      } catch { return null; }
    })(),
  ]);

  const combo = combos[0];
  const facts: SetupFacts = {
    tier: company?.is_solo === false ? "fleet" : "solo",
    profile: { displayName: profile?.display_name, employeeNumber: profile?.employee_number, region: profile?.region, localArea: profile?.local_area },
    regionsDefined: regions.length > 0 || areas.length > 0,
    license: { number: lic?.license_number, expiry: lic?.expiration_date },
    medical: { expiry: med?.expiration_date },
    scheduleDays: sched?.days_of_week?.length ?? 0,
    hasTruck: !!(settings?.current_truck_id || combo?.truck_id),
    hasTrailer: !!(settings?.current_trailer_id || combo?.trailer_id),
    plansSaved: new Set(plans.filter((p) => planHasProduct(p.payload)).map((p) => p.slot)).size,
    terminalsStarred: terms.length,
    locationsStarred: stars.length,
    fuelProgram: methods.length > 0,
    hasFuelPin: pin.length > 0,
    pushSupported: typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator,
    pushOn: push.length > 0,
    // If the connection check itself failed, show the step rather than hide it.
    telematicsConnected: tele ? !!tele.companyConnected : true,
    hoursLinked: !!tele?.connected,
    hasPerDiemHome: !!home?.city,
    vaultSet: !!vault,
  };
  const confirmations: Confirmations = {};
  for (const c of confs) confirmations[c.step as StepId] = c.confirmed_at;
  return { facts, confirmations };
}

/** Record "looks right" for a step. Saving again just refreshes the time. */
export async function confirmStep(userId: string, companyId: string, step: StepId): Promise<string | null> {
  const { error } = await supabase.from("driver_setup_confirmations").upsert({ user_id: userId, company_id: companyId, step, confirmed_at: new Date().toISOString() }, { onConflict: "user_id,step" });
  return error ? error.message : null;
}
