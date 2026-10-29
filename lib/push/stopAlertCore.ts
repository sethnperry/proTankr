// lib/push/stopAlertCore.ts
//
// A driver's duty log shows they stopped driving. If the trip is waiting on an
// arrival, or they were at a rack and have now driven somewhere else (rack
// hopping), send one push asking them to confirm. Pure: the cron route feeds it
// the trip rows and the stops from Geotab.

export type StopTrip = {
  started_at: string | null;
  pickups: { arrived_at: string | null; left_at: string | null; outcome: string | null; name: string | null; seq: number }[];
  deliveries: { arrived_at: string | null; left_at: string | null; status: string | null; name: string | null; seq: number }[];
};
export type StopIn = { at: string; code: string; resumedAt: string | null; droveFrom: string };
export type StopNotice = { at: string; title: string; body: string; kind: "arrive" | "hop"; place: string };

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
const hm = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

/** Wait this long after a stop before asking, so a fuel stop (or another clock) can be started first. */
export const STOP_GRACE_MS = 5 * 60_000;
const FUEL_LEAD_MS = 10 * 60_000;

export type FuelWindow = { started_at: string; completed_at: string | null };

/** Stops that were really a fuel stop: they fall inside a fuel stop (a little before it began, until it was finished). */
export function dropFuelStops<T extends { at: string }>(stops: T[], fuel: FuelWindow[]): T[] {
  return stops.filter((s) => {
    const t = Date.parse(s.at);
    return !fuel.some((f) => t >= Date.parse(f.started_at) - FUEL_LEAD_MS && (f.completed_at == null || t <= Date.parse(f.completed_at) + FUEL_LEAD_MS));
  });
}

/** Within this far of the rack the truck is still there (moving up in line), not gone to another rack. */
export const STILL_AT_RACK_MI = 0.5;

/** "Did you arrive?" is only asked when the truck is within this far of the stop it is headed to. */
export const ARRIVE_NEAR_MI = 1;

export function planStopNotice(trip: StopTrip, stops: StopIn[], lastAnnouncedMs: number, tz = "America/New_York", nowMs: number = Date.now(), milesFromRack: number | null = null, milesFromNext: number | null = null): StopNotice | null {
  // Not near the next stop (still at the terminal, stopped for a break): nothing to ask. Unknown distance still asks.
  const farFromNext = milesFromNext != null && milesFromNext > ARRIVE_NEAR_MI;
  const stamps = [trip.started_at, ...trip.pickups.flatMap((p) => [p.arrived_at, p.left_at]), ...trip.deliveries.flatMap((d) => [d.arrived_at, d.left_at])]
    .map(ms).filter((n) => Number.isFinite(n));
  const after = Math.max(lastAnnouncedMs, 0, ...stamps);
  const stop = [...stops].reverse().find((s) => Date.parse(s.at) > after && nowMs - Date.parse(s.at) >= STOP_GRACE_MS);
  if (!stop) return null;
  const live = trip.pickups.filter((p) => p.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
  const atRack = live.find((p) => p.arrived_at && !p.left_at);
  if (atRack) {
    // Still parked at that rack: the stop was just moving up in line, so there's nothing to ask.
    // Only ask once there's proof the truck has gone: with no position, or still at the rack, it's just a wait.
    if (milesFromRack == null || milesFromRack <= STILL_AT_RACK_MI) return null;
    // The place is the title (it stands out); the body is the one question. Yes / No buttons answer it.
    return { at: stop.at, kind: "hop", place: atRack.name ?? "the rack", title: `Did you load at ${atRack.name ?? "the rack"}?`, body: "" };
  }
  const nextPickup = live.find((p) => !p.arrived_at);
  if (nextPickup) {
    if (farFromNext) return null;
    return { at: stop.at, kind: "arrive", place: nextPickup.name ?? "the terminal", title: `Did you arrive at ${nextPickup.name ?? "the terminal"}?`, body: "" };
  }
  const nextDrop = trip.deliveries.filter((d) => d.status !== "complete" && d.status !== "cancelled").sort((a, b) => a.seq - b.seq).find((d) => !d.arrived_at);
  if (nextDrop) {
    if (farFromNext) return null;
    return { at: stop.at, kind: "arrive", place: nextDrop.name ?? "the store", title: `Did you arrive at ${nextDrop.name ?? "the store"}?`, body: "" };
  }
  return null;
}
