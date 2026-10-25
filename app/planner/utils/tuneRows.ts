// app/planner/utils/tuneRows.ts
//
// Rows for Plan Review's Tune panel: code, temp, API, lbs/gal and the date of
// the last reading, one per planned product. Pure, so it can be tested without
// the Planner. The density already reflects any tune (the caller's
// lbsPerGalForProductId reads the tuned values), so the panel and the planned
// gallons can never disagree.

import { apiTierColor, type ApiBasis } from "./apiBasis.ts";

export type TuneRow = {
  productId: string;
  code: string;
  dotColor: string;
  tempF: number;
  api: number | null;
  apiColor: string;
  lbsPerGal: number | null;
  dateLabel: string;
  tuned: boolean;
  lastApi: number | null;
  lastApiDateLabel: string | null;
};

export type TuneRowInputs = {
  productIds: Iterable<string>;
  tuned: Record<string, { api: number; tempF: number }>;
  productTempF: Record<string, number>;
  tempF: number;
  lastApiByProduct: Record<string, number | null | undefined>;
  lastInfoById: Record<string, { last_api_updated_at: string | null } | undefined>;
  lbsPerGal: (productId: string) => number | null;
  basis: (productId: string) => ApiBasis | null;
  codeById: Record<string, string | undefined>;
  nameById: Map<string, string>;
  hexById: Record<string, string | undefined>;
};

/** "10/24 3:05 PM" in the device's local time, or null for a missing/bad date. */
export function shortDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let h = d.getHours();
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12; if (h === 0) h = 12;
  return `${d.getMonth() + 1}/${d.getDate()} ${h}:${String(d.getMinutes()).padStart(2, "0")} ${ap}`;
}

export function buildTuneRows(i: TuneRowInputs): TuneRow[] {
  const rows = Array.from(i.productIds).map((pid) => {
    const tuned = i.tuned[pid] ?? null;
    const lpg = i.lbsPerGal(pid);

    // The API the plan stands on, colored by how fresh the reading is
    // (a tuned value is white).
    let displayApi: number | null = tuned ? tuned.api : null;
    let apiColor = "#ffffff";
    const basis = i.basis(pid);
    if (basis) { displayApi = basis.displayApi; apiColor = apiTierColor(basis.tier); }

    const lastApiDateLabel = shortDateTime(i.lastInfoById[pid]?.last_api_updated_at);
    const rawLast = i.lastApiByProduct[pid];
    const lastApi = rawLast != null && Number.isFinite(Number(rawLast)) ? Number(rawLast) : null;

    return {
      productId: pid,
      code: i.codeById[pid] || (i.nameById.get(pid) ?? pid),
      dotColor: (i.hexById[pid] && i.hexById[pid]!.trim()) || "rgba(255,255,255,0.5)",
      tempF: tuned ? tuned.tempF : (i.productTempF[pid] ?? i.tempF),
      api: displayApi,
      apiColor,
      lbsPerGal: lpg != null && Number.isFinite(lpg) ? lpg : null,
      dateLabel: tuned ? "just now" : (lastApiDateLabel ?? "no reading"),
      tuned: !!tuned,
      lastApi,
      lastApiDateLabel,
    };
  });
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return rows;
}
