// app/planner/utils/fuelBurn.ts
//
// Fuel-burn weight correction for the Load Report. Tare is weighed with full
// saddle tanks, so every gallon burned since then is weight the calculated
// gross still counts. Only fuel ALREADY burned is credited -- never fuel the
// driver expects to burn before the scale.
//
// Conservative means LIGHT here (the opposite of load planning): the credit
// must never be overstated, so diesel is valued at a flat 6.8 lb/gal --
// lighter than real diesel (~7.0 at 60F, ~6.9 hot), so the credit is always a
// little smaller than the truth.

export const DIESEL_CREDIT_LBS_PER_GAL = 6.8;
export const LEGAL_GROSS_LBS = 80000;

// Gauge marks, fullest first. Driver taps the mark the needle is at; if it's
// between marks, the UI tells them to pick the FULLER one -- rounding against
// the driver (less fuel burned = smaller credit).
export const GAUGE_STOPS: { label: string; fraction: number }[] = [
  { label: "F", fraction: 1 },
  { label: "7/8", fraction: 7 / 8 },
  { label: "3/4", fraction: 3 / 4 },
  { label: "5/8", fraction: 5 / 8 },
  { label: "1/2", fraction: 1 / 2 },
  { label: "3/8", fraction: 3 / 8 },
  { label: "1/4", fraction: 1 / 4 },
  { label: "1/8", fraction: 1 / 8 },
  { label: "E", fraction: 0 },
];

/** Gallons burned since a full-tank tare, from total tank size and the gauge reading. */
export function burnedFromGauge(tankGallons: number, gaugeFraction: number): number {
  if (!Number.isFinite(tankGallons) || tankGallons <= 0) return 0;
  const f = Math.min(1, Math.max(0, Number.isFinite(gaugeFraction) ? gaugeFraction : 1));
  return tankGallons * (1 - f);
}

/** Weight credit (lbs) for gallons burned, at the conservative diesel density. */
export function burnCreditLbs(gallonsBurned: number): number {
  if (!Number.isFinite(gallonsBurned) || gallonsBurned <= 0) return 0;
  return gallonsBurned * DIESEL_CREDIT_LBS_PER_GAL;
}

/** Actual gross minus the fuel-burn credit. */
export function correctedGrossLbs(actualGrossLbs: number, gallonsBurned: number): number {
  return actualGrossLbs - burnCreditLbs(gallonsBurned);
}
