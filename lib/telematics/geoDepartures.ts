// lib/telematics/geoDepartures.ts
//
// When the truck's position showed it leave a stop, kept on the phone per stop
// (pickup or delivery id). The Depart / Finished time defaults to this instead
// of the moment the driver gets around to tapping.

const key = (stopKey: string) => `proTankr:geoDepart:${stopKey}`;

export function readGeoDeparture(stopKey: string): string | null {
  try { return localStorage.getItem(key(stopKey)); } catch { return null; }
}

export function writeGeoDeparture(stopKey: string, iso: string): void {
  try { if (!localStorage.getItem(key(stopKey))) localStorage.setItem(key(stopKey), iso); } catch { /* storage blocked */ }
}

export function clearGeoDeparture(stopKey: string): void {
  try { localStorage.removeItem(key(stopKey)); } catch { /* storage blocked */ }
}
