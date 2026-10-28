// lib/capacity/useUtilizationPeriod.ts
//
// Which window a driver's utilization average covers -- resolved in ONE place
// so the Planner card and the Reports section can never quote different
// numbers for the same driver.
//
// Reuses the company's own configured report period when there is one, and
// falls back to a plain rolling 30 days when there isn't. That fallback is the
// point, not a convenience: measurement must work for a company that has
// configured nothing at all (docs/incentive-redesign-plan.md, TEST K), so this
// never gates on incentive_settings.enabled the way the legacy points card
// does -- it only reads the period shape, and shrugs if there isn't one.

"use client";

import { generatePayPeriods, type PayPeriodType } from "@/app/admin/payPeriods";
import { useReportPeriods } from "@/lib/reports/useReportPeriods";
import { localDateOf, localMidnightMs } from "@/lib/worklog/time";

const FALLBACK_DAYS = 30;

const PERIOD_LABELS: Record<PayPeriodType, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly: "Semi-Monthly",
  monthly: "Monthly",
};

export type UtilizationPeriod = {
  /** ISO timestamp to filter loaded_at from. */
  since: string;
  /** For the Planner card's compact right-hand label, e.g. "Biweekly Avg". */
  shortLabel: string;
  /** For the Reports header, e.g. "This biweekly period". */
  longLabel: string;
};

function rollingWindow(): UtilizationPeriod {
  const d = new Date();
  d.setMinutes(0, 0, 0); // steady within the hour, so it is not a new query key on every render
  d.setDate(d.getDate() - FALLBACK_DAYS);
  return {
    since: d.toISOString(),
    shortLabel: `${FALLBACK_DAYS}-Day Avg`,
    longLabel: `Last ${FALLBACK_DAYS} days`,
  };
}

export function useUtilizationPeriod(companyId: string | null, userId?: string | null): UtilizationPeriod {
  // The same period everything else uses: the driver's own if set, else the company's.
  const { settings, tz, ready } = useReportPeriods(companyId, userId);
  if (!ready || !settings) return rollingWindow();
  const start = generatePayPeriods(settings.type, settings.anchor, 1, localDateOf(Date.now(), tz))[0]?.start;
  if (!start) return rollingWindow();
  return {
    since: new Date(localMidnightMs(start, tz)).toISOString(),
    shortLabel: `${PERIOD_LABELS[settings.type]} Avg`,
    longLabel: `This ${PERIOD_LABELS[settings.type].toLowerCase()} period`,
  };
}
