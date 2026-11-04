// lib/trips/stopPrompt.ts
//
// Which duty-log stop (see lib/telematics/dutyStops.ts) the dashboard should
// ask about: the newest one after the trip's last recorded step that the
// driver hasn't answered yet.

type Stop = { at: string; code: string; resumedAt: string | null };

export const DUTY_NAME: Record<string, string> = {
  ON: "On duty", OFF: "Off duty", SB: "Sleeper", PC: "Personal conveyance", YM: "Yard move",
};

export function pendingStop(stops: Stop[] | null | undefined, o: { afterMs: number; handled: ReadonlySet<string>; stillStopped?: boolean }): Stop | null {
  // stillStopped: "Did you arrive?" is only about a stop the truck is still at. A stop the driver has already
  // driven on from is old news, and asking about it while they pull into the next place is just noise.
  const list = (stops ?? []).filter((s) => Date.parse(s.at) > o.afterMs && !o.handled.has(s.at) && !(o.stillStopped && s.resumedAt));
  return list.length ? list[list.length - 1] : null;
}

const key = (userId: string) => `proTankr:u:${userId}:handledStops`;

export function readHandledStops(userId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key(userId)) || "[]") as string[]); } catch { return new Set(); }
}
export function markStopHandled(userId: string, at: string) {
  try {
    const s = readHandledStops(userId); s.add(at);
    localStorage.setItem(key(userId), JSON.stringify([...s].slice(-40)));
  } catch { /* private mode: it may ask again */ }
}
