// lib/trips/dropSchedule.ts
//
// What a drop should take, so the last window of the delivery sequence can say
// "on schedule" or ask about a delay. The driver only taps Arrive; the start
// of the drop is Arrive plus a prep allowance (get out, walk, gauge), and its
// length is gallons at the pump rate. Anything past that plus a grace is
// time to account for. Delays already recorded are subtracted first.

const MIN = 60_000;

export type DropRules = { prepMin: number; gallonsPerMin: number; graceMin: number };

export const DEFAULT_DROP_RULES: DropRules = { prepMin: 15, gallonsPerMin: 450, graceMin: 10 };

export function dropRules(s: { delivery_prep_minutes?: number; pump_gal_per_min?: number; unaccounted_grace_minutes?: number }): DropRules {
  const pos = (n: number | undefined, d: number, min: number) => (typeof n === "number" && Number.isFinite(n) && n >= min ? n : d);
  return {
    prepMin: pos(s.delivery_prep_minutes, DEFAULT_DROP_RULES.prepMin, 0),
    gallonsPerMin: pos(s.pump_gal_per_min, DEFAULT_DROP_RULES.gallonsPerMin, 20),
    graceMin: pos(s.unaccounted_grace_minutes, DEFAULT_DROP_RULES.graceMin, 0),
  };
}

export type DropEstimate = { beginAt: string; expectedEndAt: string; dropMin: number };

export function dropEstimate(arrivedAt: string, gallons: number, rules: DropRules): DropEstimate {
  const a = Date.parse(arrivedAt);
  const dropMin = Math.max(0, Math.ceil(Math.max(0, gallons) / rules.gallonsPerMin));
  const begin = a + rules.prepMin * MIN;
  return {
    beginAt: new Date(begin).toISOString(),
    expectedEndAt: new Date(begin + dropMin * MIN).toISOString(),
    dropMin,
  };
}

export type DropOutcome =
  | { kind: "ahead"; minutes: number } // finished early (0 = right on the estimate)
  | { kind: "within_grace"; minutes: number } // late, but inside the grace
  | { kind: "over"; minutes: number }; // late past the grace: needs an answer

// finishAt vs the estimate. recordedDelayMin is delay the driver already
// logged (the Delay button), which moves the expected end later.
export function dropOutcome(args: {
  expectedEndAt: string;
  finishAt: string;
  recordedDelayMin?: number;
  graceMin: number;
}): DropOutcome {
  const expected = Date.parse(args.expectedEndAt) + Math.max(0, args.recordedDelayMin ?? 0) * MIN;
  const lateMin = Math.round((Date.parse(args.finishAt) - expected) / MIN);
  if (lateMin <= 0) return { kind: "ahead", minutes: Math.abs(lateMin) };
  if (lateMin <= args.graceMin) return { kind: "within_grace", minutes: lateMin };
  return { kind: "over", minutes: lateMin - args.graceMin };
}
