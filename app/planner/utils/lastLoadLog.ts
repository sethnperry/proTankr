"use client";
// app/planner/utils/lastLoadLog.ts
//
// Reading the last completed load from load_log: the plan and residue it left in the
// trailer, the last product per compartment, and a lookup for a load done in different
// equipment. Read-only; none of this claims or changes equipment.

import { supabase } from "@/lib/supabase/client";
import { biasToCgSlider } from "./planMath";
import { snapshotHasContent } from "./planSlotStorage";
import type { PlanSnapshot } from "../types";

export type LastLoadCtx = {
  authUserId: string | null | undefined;
  comboId: string | null | undefined;
  terminalId: string;
  readSlot: (slot: number) => unknown;
};

// ── Last load from load_log (equipment-scoped, any driver on this combo sees it) ──
// Reads planned_snapshot from the most recent completed load for this combo.
// planned_snapshot.lines contains { comp_number, product_id, un_number, ... }
// which is all we need to restore slot 0 and compute placard residue.

// For each empty compartment, find the last product loaded into it for this combo.
export async function fetchLastProductPerComp(
  ctx: LastLoadCtx,
  emptyComps: number[],
): Promise<Record<number, { product_id: string; un_number: string | null }>> {
  if (!ctx.comboId || emptyComps.length === 0) return {};

  // Step 1: get all completed load_ids for this combo, ordered newest first
  const { data: logRows, error: logErr } = await supabase
    .from("load_log")
    .select("load_id")
    .eq("combo_id", ctx.comboId)
    .order("started_at", { ascending: false })
    .limit(50);

  if (logErr || !logRows?.length) return {};
  const loadIds = logRows.map((r: any) => r.load_id);

  // Step 2: for each empty comp, find the most recent load_line from those loads
  const result: Record<number, { product_id: string; un_number: string | null }> = {};

  await Promise.all(
    emptyComps.map(async (compNum) => {
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
        const sorted = data.sort((a: any, b: any) => loadIds.indexOf(a.load_id) - loadIds.indexOf(b.load_id));
        const best = sorted[0];
        if (best?.product_id) {
          result[compNum] = {
            product_id: String(best.product_id),
            un_number: (best.products as any)?.un_number ?? null,
          };
        }
      }
    }),
  );

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
export async function fetchLastLoadFromLog(ctx: LastLoadCtx, opts?: { terminalId?: string }): Promise<any | null> {
  if (!ctx.comboId) return null;

  // Only a genuinely finalized ("loaded") row counts -- an abandoned
  // "planned" row (LOAD tapped but never confirmed LOADED) must never be
  // treated as "the last load" for slip-seat pre-fill or the Target/
  // Actual/Diff summary. No fallback to "any status" on purpose.
  let query = supabase
    .from("load_log")
    .select("load_id, status, started_at, completed_at, terminal_id, planned_total_gal, planned_gross_lbs, diff_lbs, plan_slot, cg_bias")
    .eq("combo_id", ctx.comboId)
    .eq("status", "loaded");
  if (opts?.terminalId) query = query.eq("terminal_id", opts.terminalId);
  const { data: comboRows, error: comboErr } = await query.order("started_at", { ascending: false }).limit(1);

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
  //
  // Products only, NO capOverride (2026-10-09). Pinning every compartment
  // to last load's gallons froze the next plan: a load logged without a
  // preset tapped writes plan_slot = null, refreshLastLoad then put this
  // fallback into the live plan, and every compartment stayed at last
  // load's gallons regardless of temp or API basis -- found live at Buckey
  // North, 7,767 gal unchanged from 83.4F to 92.2F and 338 lbs under
  // target. Product selection is the part we can actually know; gallons
  // must come from the plan math, never from history.
  const fallbackCompPlan: Record<string, { empty: boolean; productId: string; capOverride?: number }> = {};
  for (const line of lines) {
    const n = String(line.comp_number ?? "");
    if (!n || !line.product_id) continue;
    fallbackCompPlan[n] = { empty: false, productId: line.product_id };
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
    const presetSnap = ctx.readSlot(presetSlot) as PlanSnapshot | null;
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
    .select(
      "available_gallons, effective_available_gallons, actual_gallons, unused_gallons, utilization_pct, eligibility, exception_reason",
    )
    .eq("load_id", resolvedRow.load_id)
    .maybeSingle();
  const utilization = utilRow
    ? {
        available_gallons: Number((utilRow as any).available_gallons ?? 0),
        effective_available_gallons: Number((utilRow as any).effective_available_gallons ?? 0),
        actual_gallons: Number((utilRow as any).actual_gallons ?? 0),
        unused_gallons: Number((utilRow as any).unused_gallons ?? 0),
        utilization_pct: (utilRow as any).utilization_pct != null ? Number((utilRow as any).utilization_pct) : null,
        eligibility: (utilRow as any).eligibility,
        exception_reason: (utilRow as any).exception_reason ?? null,
      }
    : null;

  const plannedGross = resolvedRow.planned_gross_lbs != null ? Number(resolvedRow.planned_gross_lbs) : null;
  const diff = resolvedRow.diff_lbs != null ? Number(resolvedRow.diff_lbs) : null;
  const loadReport =
    plannedGross != null && diff != null
      ? {
          planned_total_gal: Number(resolvedRow.planned_total_gal ?? 0),
          planned_gross_lbs: plannedGross,
          actual_gross_lbs: plannedGross + diff,
          diff_lbs: diff,
          completed_at: (resolvedRow as any).completed_at ?? null,
          plan_slot: (resolvedRow as any).plan_slot ?? null,
          utilization,
        }
      : null;

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
    terminalId: String((resolvedRow as any).terminal_id ?? ctx.terminalId ?? ""),
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
// history (ctx.authUserId, which is effectiveUserId as passed into this
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
export async function findLastLoadAtTerminalDifferentEquipment(
  ctx: LastLoadCtx,
  terminalId: string,
): Promise<{ loadId: string; truckLabel: string; trailerLabel: string } | null> {
  if (!terminalId || !ctx.authUserId) return null;

  const { data: rows, error } = await supabase
    .from("load_log")
    .select("load_id, combo_id")
    .eq("user_id", ctx.authUserId)
    .eq("terminal_id", terminalId)
    .eq("status", "loaded")
    .order("started_at", { ascending: false })
    .limit(1);
  if (error || !rows?.length) return null;

  const loadId = rows[0].load_id ? String(rows[0].load_id) : "";
  const comboId = rows[0].combo_id ? String(rows[0].combo_id) : "";
  // Same equipment as what's already selected -- nothing "different" to
  // report; the normal recall already covers this case.
  if (!loadId || !comboId || comboId === ctx.comboId) return null;

  const { data: comboRow } = await supabase.from("equipment_combos").select("truck_id, trailer_id").eq("combo_id", comboId).maybeSingle();
  if (!comboRow) return null;

  const [truckRes, trailerRes] = await Promise.all([
    (comboRow as any).truck_id
      ? supabase
          .from("trucks")
          .select("truck_name")
          .eq("truck_id", (comboRow as any).truck_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (comboRow as any).trailer_id
      ? supabase
          .from("trailers")
          .select("trailer_name")
          .eq("trailer_id", (comboRow as any).trailer_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    loadId,
    truckLabel: (truckRes.data as any)?.truck_name ?? "Truck",
    trailerLabel: (trailerRes.data as any)?.trailer_name ?? "Trailer",
  };
}
