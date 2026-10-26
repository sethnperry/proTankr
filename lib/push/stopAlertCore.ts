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
export type StopNotice = { at: string; title: string; body: string; kind: "arrive" | "hop" };

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
const hm = (iso: string, tz: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

export function planStopNotice(trip: StopTrip, stops: StopIn[], lastAnnouncedMs: number, tz = "America/New_York"): StopNotice | null {
  const stamps = [trip.started_at, ...trip.pickups.flatMap((p) => [p.arrived_at, p.left_at]), ...trip.deliveries.flatMap((d) => [d.arrived_at, d.left_at])]
    .map(ms).filter((n) => Number.isFinite(n));
  const after = Math.max(lastAnnouncedMs, 0, ...stamps);
  const stop = [...stops].reverse().find((s) => Date.parse(s.at) > after);
  if (!stop) return null;
  const when = hm(stop.at, tz);
  const live = trip.pickups.filter((p) => p.outcome !== "no_load").sort((a, b) => a.seq - b.seq);
  const atRack = live.find((p) => p.arrived_at && !p.left_at);
  if (atRack) {
    return { at: stop.at, kind: "hop", title: "Moved to another rack?",
      body: `You left ${atRack.name ?? "the rack"} and stopped at ${when}. Tap to confirm the rack, or it was a delay.` };
  }
  const nextPickup = live.find((p) => !p.arrived_at);
  if (nextPickup) {
    return { at: stop.at, kind: "arrive", title: "Did you arrive?", body: `Your log changed at ${when}. Tap to confirm you arrived at ${nextPickup.name ?? "the terminal"}, or it was a delay.` };
  }
  const nextDrop = trip.deliveries.filter((d) => d.status !== "complete" && d.status !== "cancelled").sort((a, b) => a.seq - b.seq).find((d) => !d.arrived_at);
  if (nextDrop) {
    return { at: stop.at, kind: "arrive", title: "Did you arrive?", body: `Your log changed at ${when}. Tap to confirm you arrived at ${nextDrop.name ?? "the store"}, or it was a delay.` };
  }
  return null;
}
