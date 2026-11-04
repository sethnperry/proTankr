// lib/equipment/lastEquipment.ts
//
// Begin Trip asks the driver to confirm their equipment: the truck they last used, with the trailer that goes with
// it. Ending a shift parks the truck (Readyline or Deadline), which lets go of it, so the app has to remember which
// truck it was. This is that memory plus the rules for what the window says. Pure apart from the phone storage.

export type LastEq = { truckId: string; trailerId: string | null };
export type ComboLite = { truck_id: string | null; trailer_id: string | null; claimed_by?: string | null; active: boolean | null };
export type TripEq = { truck_id: string | null; trailer_id: string | null; started_at: string | null; driver_id?: string | null };

const key = (userId: string) => `proTankr:u:${userId}:lastEquipment`;

export function rememberLastEquipment(userId: string, eq: { truckId: string | null; trailerId: string | null }): void {
  if (!eq.truckId) return;
  try { localStorage.setItem(key(userId), JSON.stringify({ truckId: eq.truckId, trailerId: eq.trailerId ?? null, at: Date.now() })); } catch { /* private mode: the trips below still answer */ }
}

export function readLastEquipment(userId: string): LastEq | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? "null");
    return v && typeof v.truckId === "string" ? { truckId: v.truckId, trailerId: typeof v.trailerId === "string" ? v.trailerId : null } : null;
  } catch { return null; }
}

/** The driver's newest trip that had a truck. */
export function lastFromTrips(trips: TripEq[], userId: string): LastEq | null {
  const mine = trips.filter((t) => t.truck_id && (!t.driver_id || t.driver_id === userId))
    .sort((a, b) => Date.parse(b.started_at ?? "") - Date.parse(a.started_at ?? "") || 0);
  const t = mine[0];
  return t ? { truckId: t.truck_id as string, trailerId: t.trailer_id ?? null } : null;
}

/**
 * The truck to offer, and its trailer. The truck is the one remembered from the last shift end, else the one on the
 * driver's last trip. The trailer is whatever is coupled to that truck now; if the truck isn't coupled to anything,
 * the trailer it had when the driver last used it.
 */
export function resolveLast(remembered: LastEq | null, trips: LastEq | null, activeCombos: ComboLite[]): LastEq | null {
  const base = remembered ?? trips;
  if (!base) return null;
  const coupled = activeCombos.find((c) => c.active && c.truck_id === base.truckId && c.trailer_id);
  return { truckId: base.truckId, trailerId: coupled?.trailer_id ?? base.trailerId };
}

export type EqState = { kind: "mine" | "parked" | "in_use"; holderId: string | null };

/**
 * Who has this equipment. "mine": the driver already holds it. "in_use": another driver does (an active pairing
 * claimed by them, with either unit), so taking it is a commandeer. Otherwise it is parked and free.
 */
export function equipmentState(eq: LastEq, activeCombos: ComboLite[], myId: string): EqState {
  const touching = activeCombos.filter((c) => c.active && c.claimed_by && (c.truck_id === eq.truckId || (eq.trailerId && c.trailer_id === eq.trailerId)));
  if (touching.some((c) => c.claimed_by === myId)) return { kind: "mine", holderId: myId };
  const other = touching.find((c) => c.claimed_by && c.claimed_by !== myId);
  return other ? { kind: "in_use", holderId: other.claimed_by as string } : { kind: "parked", holderId: null };
}
