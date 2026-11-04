// lib/telematics/breakChip.ts
//
// What the Break chip on the hours card shows. The rule (49 CFR 395.3(a)(3)(ii)): no driving once 8 hours of driving
// have passed without a 30-minute stretch of not driving. Any 30 straight minutes of not driving (off duty, sleeper,
// or on duty not driving, so loading and pumping count) restarts that 8 hours, whenever it happens.
//
// Every stop is timed, because any 30 straight minutes counts. What differs is what the check does afterwards:
//   - A break finished once what is left of the 11 hours is 8 or less (about 3 hours or more driven) means the rule
//     can't bite again this shift. Its check is permanent.
//   - A break taken earlier restarts the 8 hours but doesn't finish the job (more than 8 hours of driving could still
//     follow), so its check shows while stopped and resets when driving starts.
//
//   done    a break is no longer needed for the rest of the shift: green check that stays
//   rested  stopped 30 minutes or more, but a break could still come due: green check while stopped only
//   timer   stopped, under 30 minutes: count up
//   idle    driving, nothing to time: 0m

import { BREAK_AFTER_DRIVE_MIN, BREAK_REST_MIN } from "./cycleRecap.ts";

export type BreakChip = "done" | "rested" | "timer" | "idle";

export function breakChip(o: { driveLeftMin: number | null | undefined; breakLeftMin: number | null | undefined; restMin: number | null }): BreakChip {
  const known = o.driveLeftMin != null && o.breakLeftMin != null;
  // The 8-hour rule can't come up before the 11-hour limit does: permanent.
  if (known && (o.breakLeftMin as number) >= (o.driveLeftMin as number)) return "done";
  if (o.restMin == null) return "idle";
  return o.restMin >= BREAK_REST_MIN ? "rested" : "timer";
}
