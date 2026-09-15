"use client";
// hooks/useLoadWorkflow.ts
// Owns: begin_load, complete_load RPCs, load state machine, load report.

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { beginLoad, completeLoad, deleteLoad, cancelPlannedLoad } from "@/lib/supabase/load";
import { computeActualLbsForLine, resolveDensestReadingPerProduct } from "../utils/planMath";
import type { CompartmentActualReading } from "../utils/planMath";
import { resolveEffectiveRackId } from "../utils/rack";
import { writeActivePlannedLoad, clearActivePlannedLoad } from "../utils/activePlannedLoad";
import type { LoadReport, PlanRow, ProductRow } from "../types";
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
  eligibility: "eligible" | "excluded_constraint" | "excluded_safety" | "excluded_incomplete_data";
  exception_reason: string | null;
  limiting_factor: string | null;
};

// Turn a raw fetch/network failure into something a driver at a terminal can
// act on. Offline load writes surface as a bare "TypeError: Failed to fetch"
// (Chrome), "Load failed" / "The network connection was lost" (WebKit/iOS),
// or "NetworkError when attempting to fetch resource" (Firefox) -- unreadable
// in the field, and the exact strings the device checklist flagged. Anything
// we don't recognize falls back to the real message so a genuine server error
// is never hidden behind a generic "no connection."
function friendlyLoadError(err: any, fallback: string): string {
  const raw = String(err?.message ?? err ?? "").toLowerCase();
  if (
    raw.includes("failed to fetch") ||
    raw.includes("load failed") ||
    raw.includes("networkerror") ||
    raw.includes("network request failed") ||
    raw.includes("network connection was lost") ||
    raw.includes("internet connection appears to be offline")
  ) {
    return "No connection — nothing was submitted. Check your signal and try again.";
  }
  return err?.message ?? fallback;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Available capacity for the live plan, measured against the CONFIGURED
   *  compartment caps rather than the driver's own capOverride -- see
   *  page.tsx's capacityResult. Null whenever there's no solvable plan. */
  capacityResult?: CapacityResult | null;
  authUserId: string | null;
  selectedComboId: string;
  selectedTerminalId: string;
  selectedRackId?: string | null; // see CLAUDE.md "rack-aware loading"
  selectedState: string;
  selectedCity: string;
  selectedCityId: string | null;
  tare: number;
  cgBias: number;
  ambientTempF: number | null;
  tempF: number;
  planRows: PlanRow[];
  plannedGallonsTotal: number;
  plannedWeightLbs: number;
  terminalProducts: ProductRow[];
  productNameById: Map<string, string>;
  productInputs: Record<string, { api?: string; tempF?: number }>;
  setProductInputs: (v: Record<string, { api?: string; tempF?: number }>) => void;
  // Resets the Loading modal's Plan Review gallons override (page.tsx state)
  // on every fresh LOAD tap -- same trigger/place setProductInputs already
  // resets for the identical reason. Optional only so this hook doesn't
  // break if ever constructed without it (defensive, not expected in practice).
  setLoadingGallonsOverride?: (v: Record<number, number>) => void;
  // Post-load refresh callbacks
  onRefreshTerminalProducts?: () => Promise<void>;  // re-fetch last_api, last_temp_f
  onRefreshTerminalAccess?: () => Promise<void>;    // re-fetch terminal expiry dates
  onPostLoadComplete?: () => Promise<void>;         // re-read load_log for slot 0 / slip seat
  predictedTempF?: number | null;                  // what the predictor said at plan time
  activeSlotLetter?: number | null;                 // which named preset (1-5 / A-E) was active when LOAD was tapped, for the recap card's "Plan X" label
};

export function useLoadWorkflow({
  authUserId,
  selectedComboId, selectedTerminalId, selectedRackId, selectedState, selectedCity, selectedCityId,
  tare, cgBias, ambientTempF, tempF,
  planRows, plannedGallonsTotal, plannedWeightLbs,
  terminalProducts, productNameById,
  productInputs, setProductInputs,
  setLoadingGallonsOverride,
  onRefreshTerminalProducts,
  onRefreshTerminalAccess,
  onPostLoadComplete,
  predictedTempF,
  activeSlotLetter,
  capacityResult,
}: Props) {
  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [beginLoadBusy, setBeginLoadBusy] = useState(false);
  const [loadingOpen, setLoadingOpen] = useState(false);
  const [loadingModalError, setLoadingModalError] = useState<string | null>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const [actualByComp, setActualByComp] = useState<
    Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }>
  >({});

  const [loadReport, setLoadReport] = useState<LoadReport | null>(null);
  // Payload utilization for the load just completed. Null until a load
  // completes, and stays null whenever the measurement couldn't run (no
  // solvable plan, or the RPC failed -- it is deliberately non-fatal).
  const [loadUtilization, setLoadUtilization] = useState<LoadUtilizationResult | null>(null);

  const PLAN_SNAPSHOT_VERSION = 1;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function alphaPerFForProductId(productId: string): number | null {
    const p = terminalProducts.find((x) => x.product_id === productId);
    if (!p || p.alpha_per_f == null) return null;
    const v = Number(p.alpha_per_f);
    return Number.isFinite(v) ? v : null;
  }

  function computePlannedGrossLbs(): number | null {
    if (![tare, plannedWeightLbs].every((x) => Number.isFinite(x))) return null;
    return tare + plannedWeightLbs;
  }

  // ── Begin load ────────────────────────────────────────────────────────────

  const beginLoadToSupabase = useCallback(async () => {
    if (beginLoadBusy) return;
    try {
      setBeginLoadBusy(true);
      if (!selectedComboId) throw new Error("Select equipment first.");
      if (!selectedTerminalId) throw new Error("Select terminal first.");
      if (!selectedState || !selectedCity) throw new Error("Select location first.");
      if (!selectedCityId) throw new Error("City ID not found.");
      if (!planRows || planRows.length === 0) throw new Error("No plan to load.");

      // Clean up any stale "planned" row left behind by a previous LOAD tap
      // for this same combo that never reached LOADED or Cancel (app
      // backgrounded/closed mid-session -- see CLAUDE.md "Pre-launch
      // cleanup: orphaned planned load_log rows"). Reuses the same
      // delete_load RPC the explicit Cancel path already calls, so this is
      // just making sure begin_load never accumulates more than one
      // abandoned planned row per combo going forward. Best-effort: a
      // failure here shouldn't block starting the new load.
      if (authUserId && selectedComboId) {
        try {
          const { data: stale } = await supabase
            .from("load_log")
            .select("load_id")
            .eq("user_id", authUserId)
            .eq("combo_id", selectedComboId)
            .eq("status", "planned");
          if (stale && stale.length > 0) {
            await Promise.all(stale.map((r: any) => deleteLoad(r.load_id).catch(() => {})));
          }
        } catch (err) {
          console.warn("stale planned-row cleanup failed (non-fatal):", err);
        }
      }

      const lines = (planRows as any[])
        .filter((r) => r.productId && Number(r.planned_gallons ?? 0) > 0)
        .map((r) => {
          const gallons = Number(r.planned_gallons ?? 0);
          const lbs = gallons * Number(r.lbsPerGal ?? 0);
          const prod = terminalProducts.find((p) => p.product_id === r.productId);
          // Capture API and its timestamp at plan time — last_api_updated_at gets
          // overwritten on load completion, so we must snapshot it now.
          const plannedApi = prod?.last_api != null ? Number(prod.last_api) : null;
          const plannedApiUpdatedAt = (prod as any)?.last_api_updated_at ?? null;
          return {
            comp_number: Number(r.comp_number),
            product_id: String(r.productId),
            product_name: prod?.product_name ?? prod?.display_name ?? null,
            button_code: (prod as any)?.button_code ?? null,
            un_number: (prod as any)?.un_number ?? null,
            planned_gallons: Number.isFinite(gallons) ? gallons : null,
            planned_lbs: Number.isFinite(lbs) ? lbs : null,
            temp_f: tempF ?? null,
            planned_api: Number.isFinite(plannedApi ?? NaN) ? plannedApi : null,
            planned_api_updated_at: plannedApiUpdatedAt,
          };
        });

      if (lines.length === 0) throw new Error("No filled compartments.");

      const planned_total_gal = Number.isFinite(plannedGallonsTotal) ? plannedGallonsTotal : null;
      const planned_total_lbs = Number.isFinite(plannedWeightLbs) ? plannedWeightLbs : null;
      const planned_gross_lbs =
        Number.isFinite(tare) && Number.isFinite(plannedWeightLbs)
          ? tare + plannedWeightLbs : null;

      const result = await beginLoad({
        combo_id: selectedComboId,
        terminal_id: selectedTerminalId,
        state_code: selectedState,
        city_id: selectedCityId,
        cg_bias: Number.isFinite(cgBias) ? cgBias : null,
        ambient_temp_f: ambientTempF ?? null,
        product_temp_f: tempF ?? null,
        planned_totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
        planned_snapshot: {
          v: PLAN_SNAPSHOT_VERSION,
          created_at: new Date().toISOString(),
          totals: { planned_total_gal, planned_total_lbs, planned_gross_lbs },
          lines,
        },
        lines,
      });

      setActiveLoadId(result.load_id);

      // Mark this as the driver's in-progress load so a reopen resumes its
      // plan + terminal instead of starting fresh (see activePlannedLoad).
      // Cleared on completion (below) and on cancel.
      writeActivePlannedLoad(authUserId, {
        loadId: result.load_id,
        comboId: String(selectedComboId),
        terminalId: String(selectedTerminalId || ""),
        rackId: selectedRackId ? String(selectedRackId) : null,
        state: String(selectedState || ""),
        city: String(selectedCity || ""),
      });

      // Rack-aware loading: tag which physical rack this load happened at
      // (see CLAUDE.md "rack-aware loading"). Plain UPDATE on the row just
      // created, same non-blocking pattern as plan_slot below -- a failure
      // here only means this load can't be attributed to a rack later,
      // never blocks the load itself. Skipped entirely for a 0/1-rack
      // terminal (selectedRackId is "" -- nothing to tag).
      if (selectedRackId && result.load_id) {
        supabase.from("load_log").update({ rack_id: selectedRackId }).eq("load_id", result.load_id)
          .then(({ error }) => { if (error) console.error("[rack] failed to tag rack_id:", error.message); });
      }

      // Recap card label ("Plan A") -- plain UPDATE on the row just created,
      // same non-blocking pattern as rack_id above. Non-fatal: a failure
      // here only means the recap can't name a preset, never blocks the
      // load itself.
      if (activeSlotLetter && result.load_id) {
        supabase.from("load_log").update({ plan_slot: activeSlotLetter }).eq("load_id", result.load_id)
          .then(({ error }) => { if (error) console.error("[recap] failed to tag plan_slot:", error.message); });
      }

      // Reset terminal access expiry — driver is actively loading, so re-card them now.
      // begin_load doesn't touch terminal_access, so we do it here.
      if (selectedTerminalId && authUserId) {
        (async () => {
  try {
    await supabase
      .from("terminal_access")
      .upsert(
        { user_id: authUserId, terminal_id: selectedTerminalId, carded_on: new Date().toISOString() },
        { onConflict: "user_id,terminal_id" }
      );

    await Promise.resolve(onRefreshTerminalAccess?.());
  } catch (err) {
  console.warn("terminal_access refresh failed (non-fatal):", err);
}
})();
      }

      // Init per-product inputs
      const nextInputs: Record<string, { api?: string; tempF?: number }> = {};
      for (const r of planRows as any[]) {
        const pid = r?.productId ? String(r.productId) : null;
        if (!pid || !Number.isFinite(Number(r?.planned_gallons ?? 0))) continue;
        if (!nextInputs[pid]) {
          // Pre-fill the API the driver sees at Log the Load. Prefer this
          // terminal's last observed reading; when the product has never been
          // loaded here, fall back to its published MINIMUM API (api_min =
          // heaviest) rather than leaving it blank -- this matches the plan's
          // own density assumption for an unproven product (lbsPerGalForProductId
          // uses api_min in that case), so the entry field and the plan agree.
          // Falls back to api_60, then "" only if neither is seeded.
          const product = terminalProducts.find((p) => p.product_id === pid);
          const firstFinite = (...vals: Array<number | null | undefined>) => {
            for (const v of vals) if (v != null && Number.isFinite(Number(v))) return String(v);
            return "";
          };
          const prefilledApi = firstFinite(
            product?.last_api,
            (product as any)?.api_min,
            product?.api_60,
          );
          nextInputs[pid] = { api: prefilledApi, tempF: Number(tempF) };
        }
      }
      setProductInputs(nextInputs);
      setLoadUtilization(null);
      setLoadingGallonsOverride?.({});
      setLoadingOpen(true);
      setLoadingModalError(null);
      setCompleteError(null); // don't carry a prior load's error into a fresh one
    } catch (err: any) {
      console.error(err);
      // No Loading modal is open yet on a begin failure (this throws before
      // setLoadingOpen(true)), so an alert is the only channel here -- but a
      // readable one, not a raw "TypeError: Failed to fetch."
      alert(friendlyLoadError(err, "Failed to begin load."));
    } finally {
      setBeginLoadBusy(false);
    }
  }, [
    beginLoadBusy, selectedComboId, selectedTerminalId, selectedRackId, selectedState, selectedCity,
    selectedCityId, planRows, plannedGallonsTotal, plannedWeightLbs,
    tare, cgBias, ambientTempF, tempF, setProductInputs, setLoadingGallonsOverride, onRefreshTerminalAccess, authUserId,
    activeSlotLetter,
  ]);

  // ── Cancel (Loading modal closed before LOADED is tapped) ─────────────────
  // begin_load inserts the load_log row immediately (needed so terminal_access
  // gets re-carded and the modal has a load_id to write into), so closing out
  // without completing must delete that row again -- otherwise every LOAD tap
  // that doesn't end in LOADED leaves a permanent blank "planned" row in My
  // Loads (the bug this fixes).
  const [cancelBusy, setCancelBusy] = useState(false);

  const cancelActiveLoad = useCallback(async () => {
    const loadId = activeLoadId;
    setLoadingOpen(false);
    // Whichever exit this is (Update Card / Back to Planner), the load is no
    // longer in progress -- a reopen should not resume it. See activePlannedLoad.
    clearActivePlannedLoad(authUserId);
    if (!loadId) return;
    setActiveLoadId(null);
    setCancelBusy(true);
    try {
      // Server-enforced, atomic: cancel_planned_load deletes the row ONLY
      // while it is still "planned", under a row lock, so a completion that
      // raced this cancel (or whose response was lost to a network drop) can
      // never be destroyed -- it stays and shows in My Loads. This replaces
      // the old client-side read-status-then-delete, which had a TOCTOU gap
      // and put the decision on the client instead of the DB.
      const cancelled = await cancelPlannedLoad(loadId);
      if (!cancelled) {
        console.warn("cancelActiveLoad: load was not planned (kept); nothing cancelled.");
      }
    } catch (err) {
      console.warn("cancelActiveLoad: cancel_planned_load failed (non-fatal):", err);
    } finally {
      setCancelBusy(false);
    }
  }, [activeLoadId, authUserId]);

  // ── On loaded (from loading modal) ────────────────────────────────────────
  // compEntries: one real, driver-entered {gallons, api, tempF} per physical
  // compartment (see LoadingModal.tsx's per-compartment Log-the-Load
  // sequence) -- this is what makes actual_gallons genuinely "actual" for
  // the first time, instead of a copy of the plan.

  const onLoadedFromLoadingModal = useCallback(async (
    compEntries: Record<number, { gallons: number; api: number; tempF: number }>
  ) => {
    if (!activeLoadId) return;

    const plannedLines = (planRows as any[]).filter(
      (r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0
    );

    for (const r of plannedLines) {
      const comp = Number(r?.comp_number ?? 0);
      const entry = compEntries[comp];
      if (
        !entry ||
        !Number.isFinite(entry.gallons) ||
        !Number.isFinite(entry.api) ||
        !Number.isFinite(entry.tempF)
      ) {
        setCompleteError("Missing a compartment reading — reopen “Log the Load” and confirm every compartment.");
        return;
      }
    }

    const nextActualByComp: Record<number, { actual_gallons: number | null; actual_lbs: number | null; temp_f: number | null }> = {};
    const readings: CompartmentActualReading[] = [];
    let actualPayloadLbs = 0;

    for (const r of plannedLines) {
      const comp = Number(r?.comp_number ?? 0);
      const pid = r?.productId ? String(r.productId) : null;
      if (!Number.isFinite(comp) || comp <= 0 || !pid) continue;

      const entry = compEntries[comp];
      const gallons = entry.gallons;
      const apiNum = entry.api;
      const tempVal = entry.tempF;
      const alpha = alphaPerFForProductId(pid);

      readings.push({ comp, productId: pid, gallons, api: apiNum, tempF: tempVal, alphaPerF: alpha });

      if (alpha == null) {
        const lpgPlanned = Number(r?.lbsPerGal ?? 0);
        const lbsPlanned = gallons * (Number.isFinite(lpgPlanned) ? lpgPlanned : 0);
        nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbsPlanned) ? lbsPlanned : null, temp_f: tempVal };
        actualPayloadLbs += Number.isFinite(lbsPlanned) ? lbsPlanned : 0;
        continue;
      }

      // Back-correct observed API to 60°F before computing lbs/gal —
      // matches bestLbsPerGallon used in planning. Without this, plan and
      // actual use different effective API60 causing a phantom diff.
      const lbs = computeActualLbsForLine(gallons, apiNum, tempVal, alpha);
      nextActualByComp[comp] = { actual_gallons: gallons, actual_lbs: Number.isFinite(lbs) ? lbs : null, temp_f: tempVal };
      if (Number.isFinite(lbs)) actualPayloadLbs += lbs;
    }

    setActualByComp(nextActualByComp);

    try {
      setCompleteBusy(true);
      setCompleteError(null);

      const lines = readings.map((a) => ({
        comp_number: a.comp,
        actual_gallons: nextActualByComp[a.comp]?.actual_gallons ?? null,
        actual_lbs: nextActualByComp[a.comp]?.actual_lbs ?? null,
        temp_f: nextActualByComp[a.comp]?.temp_f ?? null,
        actual_api: Number.isFinite(a.api) ? a.api : null,
      }));

      // product_updates feeds rack_product_status's shared "last observed"
      // terminal reading -- one entry per product, picking whichever
      // compartment's reading was colder & denser (see planMath.ts's own
      // doc comment). A product with zero valid entries (every compartment
      // for it got zeroed out) is simply absent -- never a fabricated row.
      const product_updates = resolveDensestReadingPerProduct(readings).map((r) => ({
        product_id: r.productId,
        api: r.api,
        temp_f: r.tempF as number | null,
      }));

      const res = await completeLoad({
        load_id: activeLoadId,
        lines,
        completed_at: new Date().toISOString(),
        product_updates,
      });

// Update terminal temp bias with the observed error (self-training)
// error = actual_temp - predicted_temp_at_plan_time
try {
  if (selectedTerminalId && predictedTempF != null) {
    const now = new Date();
    // Bucketed to a 3-hour window — must match app/api/fuel-temp/route.ts's read side.
    const hourUtc = Math.floor(now.getUTCHours() / 3) * 3;
    const monthOfYear = now.getUTCMonth() + 1;

    // Compute mean actual temp across all compartments for this load
    const actualTemps = Object.values(nextActualByComp)
      .map(a => a.temp_f)
      .filter((t): t is number => t != null && Number.isFinite(t));

    if (actualTemps.length > 0) {
      const meanActual = actualTemps.reduce((s, t) => s + t, 0) / actualTemps.length;
      const observedError = meanActual - predictedTempF;

      // Only update if error is plausible (not a data entry mistake)
      if (Math.abs(observedError) < 25) {
        await supabase.rpc("update_terminal_temp_bias", {
          p_terminal_id:   selectedTerminalId,
          p_hour_of_day:   hourUtc,
          p_month_of_year: monthOfYear,
          p_error:         observedError,
        });
      }
    }
  }
} catch (e) {
  console.warn("terminal_temp_bias update failed (non-fatal):", e);
}

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
let utilizationResult: LoadUtilizationResult | null = null;
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
      p_load_id: activeLoadId,
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
    const canonicalRootByProductId = new Map(
      terminalProducts.map((p) => [p.product_id, p.canonical_product_id || p.product_id])
    );
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
        .update({ last_api: u.api, last_temp_f: u.temp_f, updated_at: now, updated_by: authUserId || null, ...(newMin != null ? { min_api_observed: newMin } : {}) })
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
          .update({ last_api: u.api, last_temp_f: u.temp_f, updated_at: now, updated_by: authUserId || null, ...(sibMin != null ? { min_api_observed: sibMin } : {}) })
          .eq("rack_id", effectiveRackId)
          .eq("product_id", siblingId);
        if (siblingErr) console.warn("rack_product_status sibling propagation failed (non-fatal):", siblingErr);
      }
    }
  }
} catch (e) {
  console.warn("rack_product_status upsert threw (non-fatal):", e);
}

      const plannedGross = computePlannedGrossLbs();
      const actualGross =
        Number.isFinite(tare) && Number.isFinite(actualPayloadLbs)
          ? tare + actualPayloadLbs : null;
      // Always compute client-side now, never prefer res.diff_lbs -- the
      // server's figure is derived from load_log's begin_load-time frozen
      // snapshot, which the Loading modal's Plan Review phase can now
      // legitimately move away from (a Phase-1 gallons override). Using the
      // server's stale number here would silently disagree with
      // planned_gross_lbs right next to it, which already reflects the
      // live, possibly-adjusted plan (computePlannedGrossLbs() reads the
      // effective props passed into this hook, not the DB row).
      const diff = plannedGross != null && actualGross != null ? actualGross - plannedGross : null;

      setLoadReport({
        planned_total_gal: Number(plannedGallonsTotal),
        planned_gross_lbs: plannedGross,
        actual_gross_lbs: actualGross,
        diff_lbs: diff,
        completed_at: res?.completed_at ?? new Date().toISOString(),
        plan_slot: activeSlotLetter ?? null,
        // Same shape usePlanSlots reads back from load_utilization when a past
        // load is restored, so the Planner card has one field to render from
        // regardless of which path produced the report.
        utilization: utilizationResult ? {
          available_gallons: utilizationResult.available_gallons,
          effective_available_gallons: utilizationResult.effective_available_gallons,
          actual_gallons: utilizationResult.actual_gallons,
          unused_gallons: utilizationResult.unused_gallons,
          utilization_pct: utilizationResult.utilization_pct,
          eligibility: utilizationResult.eligibility,
          exception_reason: utilizationResult.exception_reason,
        } : null,
      });
      setLoadUtilization(utilizationResult);
      setLoadingOpen(false);
      // activeLoadId was previously only ever cleared in cancelActiveLoad
      // (Update Card/Back to Planner) -- never on a genuine successful
      // completion, so the LOAD button stayed stuck reading "Load started"
      // until a full page reload. Clear it here too so loadLabel correctly
      // falls back to RELOAD/LOAD immediately after a real completed load.
      setActiveLoadId(null);
      // Load is finalized -- a reopen should NOT resume it (only a completed
      // load's residue pre-fills, the pre-existing behavior). See activePlannedLoad.
      clearActivePlannedLoad(authUserId);

      // ── Post-load refresh (don't reset loadReport — it's set above) ─────────
      // Fire in parallel — neither touches loadReport state
      await Promise.allSettled([
        onRefreshTerminalProducts?.(),
        onRefreshTerminalAccess?.(),
        onPostLoadComplete?.(),
      ]);

    } catch (e: any) {
      console.error("complete_load failed:", e);
      // The Loading modal is still open here (setLoadingOpen(false) only runs
      // on success), so surface the error in its own themed banner
      // (errorMessage <- completeError, wired in page.tsx) and let the driver
      // re-tap "Log the Load" once signal returns -- no blocking native alert,
      // and nothing was submitted, so the completed physical load isn't lost.
      setCompleteError(friendlyLoadError(e, "Could not log the load."));
    } finally {
      setCompleteBusy(false);
    }
  }, [activeLoadId, planRows, tare, plannedGallonsTotal, terminalProducts,
      selectedTerminalId, selectedRackId, tempF, onRefreshTerminalProducts, onRefreshTerminalAccess,
      onPostLoadComplete, activeSlotLetter, capacityResult, authUserId]);

  return {
    activeLoadId,
    beginLoadBusy,
    loadingOpen, setLoadingOpen,
    loadingModalError,
    completeOpen, setCompleteOpen,
    completeBusy,
    completeError,
    actualByComp,
    loadReport, setLoadReport,
    loadUtilization, setLoadUtilization,
    beginLoadToSupabase,
    onLoadedFromLoadingModal,
    cancelActiveLoad,
    cancelBusy,
  };
}
