// lib/equipment/holderWorking.ts
//
// Is the driver holding a unit actually working? Admins and dispatchers never take over equipment a working driver is
// using, but a claim by someone with no shift open and no trip open (the equipment was linked for them and they never
// opened the app, or they left it selected) is idle, and can be taken over. Pure: the caller passes the rows.

import { deriveShifts, openShift } from "../shifts/shiftLogic.ts";
import type { ShiftEventRow } from "../trips/types.ts";

const OPEN_TRIP = new Set(["draft", "loading", "in_transit", "delivering"]);

export function holderIsWorking(o: { userId: string; shiftEvents: ShiftEventRow[]; tripStatuses: string[]; nowIso: string }): boolean {
  if (o.tripStatuses.some((s) => OPEN_TRIP.has(s))) return true;
  return !!openShift(deriveShifts(o.shiftEvents, o.userId, o.nowIso));
}
