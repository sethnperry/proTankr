// lib/telematics/breakChip.ts
//
// What the Break chip on the hours card shows. The rule (49 CFR 395.3(a)(3)(ii)): no driving once 8 hours of driving
// have passed without a 30-minute stretch of not driving. Any 30 straight minutes of not driving (off duty, sleeper,
// or on duty not driving, so loading and pumping count) restarts that 8 hours, whenever it happens.
//
// So a stop only matters for the rest of the shift if it changes whether the rule can still bite before the
// 11-hour driving limit does. After a break the 8 hours start over; if what is left of the 11 hours is 8 or less,
// the rule can't bite again this shift and the check stays. With more than 8 left (under 3 hours driven), a break
// does restart the 8 hours but doesn't finish the job, so there is nothing to time.
//
//   done  a break is no longer needed for the rest of the shift: green check, stays until the shift's clocks reset
//   timer stopped, and 30 minutes of this would finish it: count up
//   idle  anything else: nothing to time

import { BREAK_AFTER_DRIVE_MIN, BREAK_REST_MIN } from "./cycleRecap.ts";

export type BreakChip = "done" | "timer" | "idle";

export function breakChip(o: { driveLeftMin: number | null | undefined; breakLeftMin: number | null | undefined; restMin: number | null }): BreakChip {
  const known = o.driveLeftMin != null && o.breakLeftMin != null;
  // Without both clocks, behave as before: a 30-minute stop is done, a shorter one counts up.
  if (!known) return o.restMin == null ? "idle" : o.restMin >= BREAK_REST_MIN ? "done" : "timer";
  const driveLeft = o.driveLeftMin as number;
  const breakLeft = o.breakLeftMin as number;
  // The 8-hour rule can't come up before the 11-hour limit does.
  if (breakLeft >= driveLeft) return "done";
  // A break from here would leave 8 hours of driving at most, so it would finish the requirement for the shift.
  const wouldFinish = driveLeft <= BREAK_AFTER_DRIVE_MIN;
  if (wouldFinish && o.restMin != null) return o.restMin >= BREAK_REST_MIN ? "done" : "timer";
  return "idle";
}
