// lib/capacity/computeUtilization.ts
//
// Turns a capacity result plus what was actually loaded into the per-load
// utilization row. Pure -- same reasoning as computeAvailableCapacity.ts.
//
// Two rules from the spec are structural here, not styling choices:
//
//  * Safety is a GATE, never a term (spec section 10). A load that exceeds a
//    hard constraint is excluded from aggregates entirely -- it cannot raise a
//    score, and it is not folded back in as a penalty either. It surfaces as
//    its own count.
//
//  * A driver is never penalised for capacity an external party took away
//    (spec section 11). A cap with a known figure re-baselines the
//    denominator; a cap we know about but cannot quantify excludes the load
//    rather than guessing at a number.

/**
 * What the driver-facing metric is CALLED, in one place.
 *
 * "Payload" as of the per-compartment Log-the-Load rework: actual_gallons is
 * now genuinely driver-entered (one real Gallons/API/Temp confirmation per
 * physical compartment, in order, at completion -- see
 * useLoadWorkflow.ts's onLoadedFromLoadingModal and
 * LoadingModal.tsx's compEntries sequence), not a copy of the plan, so
 * "GAL LOADED" is now a claim the data actually supports.
 * See docs/incentive-redesign-plan.md section 8.
 */
export const UTILIZATION_METRIC_LABEL = "Payload Utilization";
export const UTILIZATION_ACTUAL_WORD = "loaded";

export type UtilizationEligibility =
  | "eligible"
  | "excluded_constraint"      // externally capped, amount unknown
  | "excluded_safety"          // over legal gross, or a compartment overfilled
  | "excluded_incomplete_data"; // capacity or actual could not be established

/** Where actual_gallons came from. record_load_utilization now writes DRIVER
 *  (a real per-compartment BOL confirmation, see UTILIZATION_METRIC_LABEL's
 *  own comment above) for every load going forward; PLANNER remains in the
 *  enum only to keep pre-rework historical rows interpretable, and the rest
 *  of the enum exists so a future source (a rack ticket, a TMS feed) is a
 *  source swap, not a migration. */
export type ActualGallonsSource =
  | "PLANNER" | "DRIVER" | "RACK_TICKET" | "TMS" | "DISPATCH" | "API" | "OCR" | "IMPORT";

export type UtilizationInput = {
  /** Max gallons within the company target -- the driver's denominator. */
  available_gallons: number;
  actual_gallons: number;
  /** Actual gross weight, for the safety gate. Null = unknown, not a pass. */
  actual_gross_lbs: number | null;
  legal_gross_lbs: number;
  /** True if any compartment's actual exceeded its configured cap. */
  compartment_overfilled: boolean;
  /** Lowest quantified external cap in gallons, if any (spec section 11). */
  external_cap_gallons: number | null;
  /** An external cap is known to apply but its size isn't (e.g. an Out of
   *  Allocation outage report, which records that a terminal capped this
   *  product but carries no gallon figure). */
  has_unquantified_constraint: boolean;
};

export type UtilizationResult = {
  available_gallons: number;
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  utilization_pct: number | null;
  eligibility: UtilizationEligibility;
  exception_reason: string | null;
};

export function computeUtilization(input: UtilizationInput): UtilizationResult {
  const available = Number(input.available_gallons);
  const actual = Number(input.actual_gallons);

  const base = {
    available_gallons: Number.isFinite(available) ? available : 0,
    actual_gallons: Number.isFinite(actual) ? actual : 0,
  };

  if (!Number.isFinite(available) || available <= 0 || !Number.isFinite(actual) || actual < 0) {
    return {
      ...base,
      effective_available_gallons: base.available_gallons,
      unused_gallons: 0,
      utilization_pct: null,
      eligibility: "excluded_incomplete_data",
      exception_reason: "Available capacity or actual gallons could not be established for this load.",
    };
  }

  // ── Safety gate, checked before anything else so a violation can never be
  // scored under any denominator (spec section 10). Keys off the LEGAL limit,
  // not the company target -- loading above a target but under the legal
  // ceiling is a legal, well-executed load, not a violation.
  const overLegal =
    input.actual_gross_lbs != null &&
    Number.isFinite(input.actual_gross_lbs) &&
    Number(input.actual_gross_lbs) > Number(input.legal_gross_lbs);

  if (overLegal || input.compartment_overfilled) {
    return {
      ...base,
      effective_available_gallons: available,
      unused_gallons: Math.max(0, available - actual),
      utilization_pct: null,
      eligibility: "excluded_safety",
      exception_reason: overLegal
        ? `Actual gross weight exceeded the legal limit of ${Math.round(Number(input.legal_gross_lbs)).toLocaleString()} lbs.`
        : "A compartment was loaded beyond its configured cap.",
    };
  }

  // ── External constraints. A quantified cap re-baselines the denominator so
  // the driver is measured against what they were actually allowed to load.
  const cap = input.external_cap_gallons;
  const hasQuantifiedCap = cap != null && Number.isFinite(cap) && cap > 0;

  // Only narrows -- a "cap" above real capacity constrained nothing.
  const effectiveAvailable = hasQuantifiedCap ? Math.min(available, Number(cap)) : available;

  if (!hasQuantifiedCap && input.has_unquantified_constraint) {
    return {
      ...base,
      effective_available_gallons: effectiveAvailable,
      unused_gallons: Math.max(0, effectiveAvailable - actual),
      utilization_pct: null,
      eligibility: "excluded_constraint",
      exception_reason: "This load was capped by an external constraint of unknown size, so it is excluded rather than measured against full capacity.",
    };
  }

  // ── Utilization. Deliberately NOT clamped at 100: with the company target as
  // the denominator, above-target-but-under-legal is a real, legal, well-loaded
  // trip, and clamping would erase the difference between hitting the target
  // and safely beating it -- the exact behavior this metric should reward.
  const utilization = (actual / effectiveAvailable) * 100;

  return {
    ...base,
    effective_available_gallons: effectiveAvailable,
    unused_gallons: Math.max(0, effectiveAvailable - actual),
    utilization_pct: utilization,
    eligibility: "eligible",
    exception_reason: hasQuantifiedCap
      ? `Measured against an external cap of ${Math.round(Number(cap)).toLocaleString()} gal rather than full capacity.`
      : null,
  };
}

/** The minimum a row needs for the period aggregate below. Both the pure
 *  engine's own UtilizationResult and the load_utilization rows read back from
 *  the database satisfy it, so there is ONE aggregation for both rather than a
 *  near-identical copy per call site -- the drift this project keeps getting
 *  bitten by (see CustomSelect/ServiceTypeManager, and the centering bug fixed
 *  in one file but not its twin). */
export type AggregatableUtilization = {
  effective_available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  eligibility: UtilizationEligibility;
};

export type UtilizationSummary = {
  eligible_loads: number;
  excluded_safety: number;
  excluded_constraint: number;
  excluded_incomplete_data: number;
  available_gallons: number;
  actual_gallons: number;
  unused_gallons: number;
  /** Gallon-weighted, never a mean of per-load percentages -- averaging
   *  percentages lets a string of tiny loads swamp the real number. */
  utilization_pct: number | null;
};

/**
 * Period aggregate. Only eligible loads contribute; excluded ones are counted,
 * never scored (spec section 10).
 */
export function aggregateUtilization(rows: AggregatableUtilization[]): UtilizationSummary {
  let availableSum = 0, actualSum = 0, unusedSum = 0;
  let eligible = 0, excludedSafety = 0, excludedConstraint = 0, excludedIncomplete = 0;

  for (const r of rows) {
    switch (r.eligibility) {
      case "eligible":
        eligible++;
        availableSum += Number(r.effective_available_gallons ?? 0);
        actualSum += Number(r.actual_gallons ?? 0);
        unusedSum += Number(r.unused_gallons ?? 0);
        break;
      case "excluded_safety": excludedSafety++; break;
      case "excluded_constraint": excludedConstraint++; break;
      case "excluded_incomplete_data": excludedIncomplete++; break;
    }
  }

  return {
    eligible_loads: eligible,
    excluded_safety: excludedSafety,
    excluded_constraint: excludedConstraint,
    excluded_incomplete_data: excludedIncomplete,
    available_gallons: availableSum,
    actual_gallons: actualSum,
    unused_gallons: unusedSum,
    utilization_pct: availableSum > 0 ? (actualSum / availableSum) * 100 : null,
  };
}

/**
 * Coerce one `load_utilization` row's numerics into real JS numbers.
 *
 * PostgREST hands `numeric` columns back without any guarantee that they
 * arrive as JSON numbers, and this app already treats them as needing
 * coercion everywhere else it reads them -- usePlanSlots' own recall lookup
 * does exactly this field for field, MyLoadsModal wraps every numeric in
 * Number() before formatting, and PayrollReportModal sums through Number().
 *
 * Doing it HERE, at the boundary, rather than at each call site is the point.
 * `UtilizationRow` declares these as `number`, so anything downstream is
 * entitled to call `.toFixed()` on them -- and a string that reaches a display
 * does not degrade gracefully, it throws and takes the whole screen with it.
 * One normaliser keeps the declared type honest for every present and future
 * consumer instead of relying on each one to remember.
 *
 * Null stays null: an excluded load genuinely has no percentage, and 0 there
 * would read as "this driver loaded nothing."
 */
export function normalizeUtilizationRow<T extends Record<string, unknown>>(row: T): T {
  const num = (v: unknown) => (v == null ? 0 : Number(v));
  return {
    ...row,
    available_gallons: num(row.available_gallons),
    effective_available_gallons: num(row.effective_available_gallons),
    actual_gallons: num(row.actual_gallons),
    unused_gallons: num(row.unused_gallons),
    utilization_pct: row.utilization_pct == null ? null : Number(row.utilization_pct),
  };
}

/**
 * Per-driver breakdown for the fleet view.
 *
 * Deliberately NOT a leaderboard (spec section 17). Rows come back sorted by
 * name, never by score, and carry no rank -- the fleet question is "where is
 * capacity going unused," not "who is worst." The old benchmark-era dashboard
 * sorted by recovered gallons descending on purpose ("a leaderboard framing
 * fits the number that justifies the subscription"); that framing is
 * explicitly reversed here, because a per-driver ranking on a metric partly
 * driven by dispatch, terminal allocation and equipment is a blame chart
 * dressed as a scoreboard.
 *
 * Each driver's own percentage is gallon-weighted through the same
 * aggregateUtilization used for the fleet total, so a driver's row and the
 * headline can never be computed two different ways.
 */
export type DriverUtilizationGroup = {
  driver_id: string;
  display_name: string;
  summary: UtilizationSummary;
  total_loads: number;
};

export function groupUtilizationByDriver<
  T extends AggregatableUtilization & { driver_id: string }
>(rows: T[], nameById: Record<string, string>): DriverUtilizationGroup[] {
  const byDriver = new Map<string, T[]>();
  for (const r of rows) {
    const list = byDriver.get(r.driver_id);
    if (list) list.push(r);
    else byDriver.set(r.driver_id, [r]);
  }

  return Array.from(byDriver.entries())
    .map(([driver_id, driverRows]) => ({
      driver_id,
      display_name: nameById[driver_id] ?? "Unknown",
      summary: aggregateUtilization(driverRows),
      total_loads: driverRows.length,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

/** One capacity snapshot's contribution to fleet headroom (spec section 4a). */
export type AggregatableHeadroom = {
  available_gallons: number;
  capacity_at_legal_gallons: number;
  limiting_factor: string | null;
};

export type HeadroomSummary = {
  capacity_at_target_gallons: number;
  capacity_at_legal_gallons: number;
  /** What a safely-raised company target would unlock over this period. */
  headroom_gallons: number;
  /** Loads whose ceiling was the company target rather than tank volume --
   *  the only ones a target raise could actually help. */
  target_limited_loads: number;
  loads: number;
};

/**
 * Sums headroom across a period. Never negative per load: a legal ceiling
 * below the target ceiling is nonsense, and clamping at the row keeps one
 * bad snapshot from silently cancelling out real headroom elsewhere.
 */
export function aggregateHeadroom(snapshots: AggregatableHeadroom[]): HeadroomSummary {
  let atTarget = 0, atLegal = 0, headroom = 0, targetLimited = 0;

  for (const s of snapshots) {
    const t = Number(s.available_gallons ?? 0);
    const l = Number(s.capacity_at_legal_gallons ?? 0);
    if (!Number.isFinite(t) || !Number.isFinite(l)) continue;
    atTarget += t;
    atLegal += l;
    headroom += Math.max(0, l - t);
    if (s.limiting_factor === "company_target") targetLimited++;
  }

  return {
    capacity_at_target_gallons: atTarget,
    capacity_at_legal_gallons: atLegal,
    headroom_gallons: headroom,
    target_limited_loads: targetLimited,
    loads: snapshots.length,
  };
}
