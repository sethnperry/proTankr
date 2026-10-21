// lib/telematics/hosTripNotify.ts
//
// When the driver's "clocks vs the rest of the trip" check should send a
// notification: newly bad, or newly tight from fine. Getting worse (tight ->
// bad) notifies again; staying put doesn't. Pure.

export type Level = "ok" | "warn" | "bad";

export function shouldNotifyHosTrip(prev: Level | null, now: Level): boolean {
  if (prev === null) return false; // first look is a baseline: the card already shows it
  if (now === "ok") return false;
  if (now === "bad") return prev !== "bad";
  return prev === "ok"; // warn
}
