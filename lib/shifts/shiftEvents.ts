// lib/shifts/shiftEvents.ts
//
// The one writer for shift events. It uses the same offline store as the trip rows: the id is made on the phone,
// the row is queued, and it lands exactly once when the phone is back online (shift_events is insert-only on
// the server, so a re-sent event is skipped, not duplicated).

import { newId, type TripStore } from "../trips/tripStore.ts";
import type { ShiftEventRow, ShiftSource } from "../trips/types.ts";

export function recordShiftEvent(
  store: TripStore,
  o: {
    companyId: string;
    /** The driver the shift belongs to. */
    userId: string;
    /** Who made the entry (the driver, or a dispatcher on their behalf). */
    actorId: string;
    type: string;
    at?: string;
    payload?: Record<string, unknown>;
    source?: ShiftSource;
  },
): ShiftEventRow {
  const row: ShiftEventRow = {
    event_id: newId(),
    company_id: o.companyId,
    user_id: o.userId,
    event_type: o.type,
    occurred_at: o.at ?? new Date().toISOString(),
    actor_id: o.actorId,
    payload: o.payload ?? {},
    // A dispatcher's entry for a driver is a manual one; the driver's own taps come from the app.
    source: o.source ?? (o.actorId === o.userId ? "app" : "manual"),
  };
  store.put("shift_events", row);
  return row;
}
