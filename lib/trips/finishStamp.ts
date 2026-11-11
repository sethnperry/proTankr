// lib/trips/finishStamp.ts
//
// When the driver tapped Finish Loading at a pickup, kept on the phone per pickup. That tap is the end of loading:
// the Loaded sheet's end time defaults to it, not to the moment the BOL and gallons were done being typed.

const key = (pickupId: string) => `proTankr:finishLoading:${pickupId}`;

export function stampFinishLoading(pickupId: string, iso: string = new Date().toISOString()): void {
  try { localStorage.setItem(key(pickupId), iso); } catch { /* storage blocked */ }
}
export function readFinishLoading(pickupId: string): string | null {
  try { return localStorage.getItem(key(pickupId)); } catch { return null; }
}
export function clearFinishLoading(pickupId: string): void {
  try { localStorage.removeItem(key(pickupId)); } catch { /* storage blocked */ }
}
