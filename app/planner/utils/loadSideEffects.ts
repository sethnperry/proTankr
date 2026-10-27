"use client";
// app/planner/utils/loadSideEffects.ts
//
// What happens on the server after a load is logged: the terminal temperature bias, the
// payload-utilization measurement, and the rack's last-observed readings. Each is
// non-fatal: a failure is logged and the load still completes.

import { isPlausibleApi } from "./apiBasis";
import { supabase } from "@/lib/supabase/client";
import { resolveEffectiveRackId } from "./rack";
import type { ProductRow } from "../types";
import type { CapacityResult } from "@/lib/capacity/computeAvailableCapacity";

/** What record_load_utilization returns. Nullable percentage on purpose: an
 *  excluded load genuinely has no score, and null says that where a 0 would
 *  read as "this driver loaded nothing." */
export type LoadUtilizationResult = {
  ok: boolean;
  available_gallons: number;
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  utilization_pct: number | null;
  eligibility: "excluded_constraint" | "excluded_safety" | "excluded_incomplete_data" | "eligible";
  exception_reason: string | null;
  limiting_factor: string | null;
};

export async function updateTerminalTempBias(args: {
  selectedTerminalId: string | null | undefined;
  basisPredictedTempF: number | null | undefined;
  nextActualByComp: Record<number, { temp_f: number | null }>;
}) {
  const { selectedTerminalId, basisPredictedTempF, nextActualByComp } = args;
  // Update terminal temp bias with the observed error (self-training)
  // error = actual_temp - UNBIASED prediction.
  //
  // Real bug fixed 2026-09-27: this used to measure against the FINAL
  // prediction, which already had the stored bias added. The stored value is
  // meant to be the model's systematic error, so recording residuals of an
  // already-corrected number made the mean drift toward zero once corrections
  // took effect (it learned "how wrong the correction is", then applied that as
  // if it were the whole correction). Measuring against the pre-bias prediction
  // makes mean_error mean exactly what the read side treats it as.
  try {
    if (selectedTerminalId && basisPredictedTempF != null) {
      const now = new Date();
      // Bucketed to a 3-hour window — must match app/api/fuel-temp/route.ts's read side.
      const hourUtc = Math.floor(now.getUTCHours() / 3) * 3;
      const monthOfYear = now.getUTCMonth() + 1;

      // Compute mean actual temp across all compartments for this load
      const actualTemps = Object.values(nextActualByComp)
        .map((a) => a.temp_f)
        .filter((t): t is number => t != null && Number.isFinite(t));

      if (actualTemps.length > 0) {
        const meanActual = actualTemps.reduce((s, t) => s + t, 0) / actualTemps.length;
        const observedError = meanActual - basisPredictedTempF;

        // Only update if error is plausible (not a data entry mistake)
        if (Math.abs(observedError) < 25) {
          await supabase.rpc("update_terminal_temp_bias", {
            p_terminal_id: selectedTerminalId,
            p_hour_of_day: hourUtc,
            p_month_of_year: monthOfYear,
            p_error: observedError,
          });
        }
      }
    }
  } catch (e) {
    console.warn("terminal_temp_bias update failed (non-fatal):", e);
  }
}

export async function recordLoadUtilization(
  loadId: string,
  capacityResult: CapacityResult | null | undefined,
): Promise<LoadUtilizationResult | null> {
  let utilizationResult: LoadUtilizationResult | null = null;
  // Payload utilization -- silent, non-fatal, same fire-and-forget shape as
  // the temp-bias update above. This is now the only incentive calculation
  // the app runs: the legacy calculate_load_points call that used to sit
  // here was removed once this engine was validated against real loads.
  //
  // The client sends only the computed capacity. record_load_utilization
  // re-derives every INPUT server-side (tare, target, caps, densities,
  // actuals) and enforces the safety gate itself, so a crafted request can't
  // shrink its own denominator or score a violation -- see that migration's
  // own header for why capacity itself can't be computed there.
  // Say so when the measurement is skipped. capacityCompartments (page.tsx)
  // silently drops any compartment whose product is missing api_60/alpha_per_f
  // or whose configured cap_gallons is absent -- correct (capacity is
  // underivable without density), but if EVERY compartment drops, capacity is
  // 0, no row is ever written, and load_utilization just stays empty with
  // nothing anywhere saying why. That is indistinguishable from the engine
  // being broken, so it gets a warning rather than silence.
  if (!capacityResult || !(capacityResult.available_gallons > 0)) {
    console.warn(
      "record_load_utilization skipped: no solvable capacity for this load " +
        "(a planned product is likely missing api_60/alpha_per_f, or a compartment " +
        "has no configured cap_gallons).",
      { available_gallons: capacityResult?.available_gallons ?? null },
    );
  } else {
    try {
      const { data: utilRes, error: utilErr } = await supabase.rpc("record_load_utilization", {
        p_load_id: loadId,
        p_capacity: {
          calc_version: capacityResult.calc_version,
          available_gallons: capacityResult.available_gallons,
          available_payload_lbs: capacityResult.available_payload_lbs,
          capacity_at_legal_gallons: capacityResult.capacity_at_legal_gallons,
          total_volume_gallons: capacityResult.total_volume_gallons,
          limiting_factor: capacityResult.limiting_factor,
        },
      });
      if (utilErr) throw utilErr;
      if (utilRes?.ok) utilizationResult = utilRes as LoadUtilizationResult;
    } catch (e) {
      console.warn("record_load_utilization failed (non-fatal):", e);
    }
  }
  return utilizationResult;
}

export async function writeRackReadings(args: {
  selectedRackId: string | null | undefined;
  selectedTerminalId: string | null | undefined;
  product_updates: { product_id: string; api: number; temp_f: number | null }[];
  terminalProducts: ProductRow[];
  authUserId: string | null | undefined;
}) {
  const { selectedRackId, selectedTerminalId, product_updates, terminalProducts, authUserId } = args;
  // Persist "last observed" API/temp so LoadingModal can show previous API on
  // reload -- rack_product_status only (see CLAUDE.md "rack-aware loading,
  // unified"). terminal_products is deliberately no longer written here: with
  // every terminal now guaranteed a rack (auto-named "Main Rack" for
  // terminals that never touched the Terminal tab), a rack IS the terminal's
  // product list and reference reading, so there's no separate terminal-wide
  // store left to keep in sync. (Non-fatal if RLS blocks it.)
  try {
    // Resolves the terminal's own rack when none was selected at load time --
    // see resolveEffectiveRackId's own doc comment (now shared with
    // useTerminalOutageReports.ts's Out-of-Product report path).
    const effectiveRackId = await resolveEffectiveRackId(selectedRackId, selectedTerminalId);

    if (effectiveRackId && product_updates.length > 0) {
      const now = new Date().toISOString();

      // Canonical-group siblings on this rack (e.g. D2 <-> its dyed variant)
      // -- physically the same tank/feed at the point of loading, so one
      // product's observed reading is also true for the other. Propagation
      // is update-only, same reasoning as the insert-vs-update split below:
      // a sibling only gets the new reading if it already has a real row on
      // this rack (i.e. it was already offered/tracked here) -- this never
      // creates a new curated entry for a sibling nobody actually assigned
      // to this rack.
      const canonicalRootByProductId = new Map(terminalProducts.map((p) => [p.product_id, p.canonical_product_id || p.product_id]));
      const siblingsByRoot = new Map<string, string[]>();
      for (const p of terminalProducts) {
        const root = canonicalRootByProductId.get(p.product_id)!;
        const list = siblingsByRoot.get(root) ?? [];
        list.push(p.product_id);
        siblingsByRoot.set(root, list);
      }

      // Fold each observed API into the rack's running lowest-ever ("min
      // observed") -- the basis for the Loading modal's "Safe (this terminal's
      // heaviest)" stale-API choice. Client-side LEAST against the value from
      // the last fetch: a two-load race could miss one update, acceptable for
      // this app's one-operator reality and consistent with the non-fatal
      // write-through pattern here. Only folds a genuinely finite reading.
      const minObservedFor = (productId: string, api: number): number | null => {
        if (!Number.isFinite(api)) return null;
        const existing = terminalProducts.find((p) => p.product_id === productId)?.min_api_observed;
        return existing != null && Number.isFinite(Number(existing)) ? Math.min(Number(existing), api) : api;
      };

      for (const u of product_updates) {
        // Never record a reading that can't be real for this product (typo, test entry): it would become the
        // terminal's "last" and "heaviest" and skew every plan there afterwards.
        const refApi = (terminalProducts.find((p) => p.product_id === u.product_id) as any)?.api_60;
        if (!isPlausibleApi(u.api, refApi)) { console.warn("[readings] skipped an implausible API:", u.api, "for", u.product_id); continue; }
        const newMin = minObservedFor(u.product_id, u.api);
        // Update-then-insert-if-missing instead of a blind upsert: the
        // Terminal tab's rack Product List filters rack_product_status on
        // active = true (page.tsx / EditTerminalModal.tsx), an admin/lead-
        // curated "this rack carries this product" flag -- a blind upsert
        // defaulting active's own column default (true) would silently add
        // a product to that curated list just because a driver happened to
        // plan it here, even if nobody ever actually assigned it to this
        // rack. A genuine insert sets active: false (informational reading
        // only, not a curation claim); an existing row's active flag is
        // never touched either way.
        const { data: rpsUpdated, error: rpsUpdateErr } = await supabase
          .from("rack_product_status")
          .update({
            last_api: u.api,
            last_temp_f: u.temp_f,
            updated_at: now,
            updated_by: authUserId || null,
            ...(newMin != null ? { min_api_observed: newMin } : {}),
          })
          .eq("rack_id", effectiveRackId)
          .eq("product_id", u.product_id)
          .select("rack_id");

        if (rpsUpdateErr) {
          console.warn("rack_product_status update failed (non-fatal):", rpsUpdateErr);
        } else if (!rpsUpdated || rpsUpdated.length === 0) {
          const { error: rpsInsertErr } = await supabase.from("rack_product_status").insert({
            rack_id: effectiveRackId,
            product_id: u.product_id,
            last_api: u.api,
            last_temp_f: u.temp_f,
            updated_at: now,
            updated_by: authUserId || null,
            active: false,
            ...(newMin != null ? { min_api_observed: newMin } : {}),
          });
          if (rpsInsertErr) console.warn("rack_product_status insert failed (non-fatal):", rpsInsertErr);
        }

        const root = canonicalRootByProductId.get(u.product_id) ?? u.product_id;
        const siblingIds = (siblingsByRoot.get(root) ?? []).filter((pid) => pid !== u.product_id);
        for (const siblingId of siblingIds) {
          const sibMin = minObservedFor(siblingId, u.api);
          const { error: siblingErr } = await supabase
            .from("rack_product_status")
            .update({
              last_api: u.api,
              last_temp_f: u.temp_f,
              updated_at: now,
              updated_by: authUserId || null,
              ...(sibMin != null ? { min_api_observed: sibMin } : {}),
            })
            .eq("rack_id", effectiveRackId)
            .eq("product_id", siblingId);
          if (siblingErr) console.warn("rack_product_status sibling propagation failed (non-fatal):", siblingErr);
        }
      }
    }
  } catch (e) {
    console.warn("rack_product_status upsert threw (non-fatal):", e);
  }
}
