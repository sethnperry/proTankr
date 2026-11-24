// lib/trips/bio.ts
//
// Bio blended into diesel at the drop. The driver enters the gallons the blender printed per compartment; the percent
// buttons only prefill that number.

export const BIO_PERCENTS = [5, 10, 20] as const;

/** Bio gallons for a percent of the compartment's gallons, to two decimals. */
export function bioFromPercent(gallons: number, pct: number): number {
  return Math.round(gallons * pct) / 100;
}

/** The bio as a percent of the diesel gallons, one decimal ("23.5"), or null when it can't be worked out. */
export function bioPercentOf(gallons: number, bio: number): string | null {
  if (!(gallons > 0) || !(bio > 0)) return null;
  return (Math.round((bio / gallons) * 1000) / 10).toFixed(1);
}

/** A bio entry as a number, or null when blank or not a positive number. */
export function parseBio(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Whole gallons for display: "1,009". */
export function bioLabel(bio: number): string {
  return Math.round(bio).toLocaleString("en-US");
}
