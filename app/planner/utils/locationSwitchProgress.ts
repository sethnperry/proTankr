// locationSwitchProgress.ts
// Same per-user-keyed, try/catch-wrapped, SSR-safe localStorage style as
// onboardingProgress.ts -- tracks whether a driver has ever switched their
// selected terminal to a different CITY than the first one they ever had
// selected, for the Setup Guide checklist's "switch to a terminal in a
// different city" sub-task.
//
// Deliberately NOT derived from live shell.location state the way the rest
// of the checklist is (see utils/setupChecklist.ts's own header comment) --
// unlike a saved plan, which should always reflect whatever's currently
// saved, this is a one-time skill demonstration: a driver who switches to a
// different city once, then (obviously) switches back to the city they
// actually work out of, shouldn't see the checklist item un-check itself.
// So this is a sticky, write-once "did this ever happen" flag, not a second
// source of truth for location itself -- that still only ever lives in
// shell.location.

function baselineKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:locationSwitchBaselineCity`;
}
function switchedKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:hasSwitchedCity`;
}

// Pure and directly testable -- normalizes a state/city pair into one
// comparison key, case/whitespace-insensitive so "FL"/"fl" or "Tampa "/
// "Tampa" don't read as a switch.
export function cityKey(state: string | null | undefined, city: string | null | undefined): string {
  return `${(state ?? "").trim().toLowerCase()}||${(city ?? "").trim().toLowerCase()}`;
}

// Call from an effect (not during render -- this writes) whenever the
// live selected state/city changes. First call for an account just
// records the baseline; a later call with a genuinely different city
// flips the sticky "switched" flag permanently.
export function recordLocationForSwitchTracking(
  userId: string | null | undefined,
  state: string | null | undefined,
  city: string | null | undefined
): void {
  const bKey = baselineKey(userId);
  const sKey = switchedKey(userId);
  if (!bKey || !sKey || !city || typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(sKey) === "1") return;
    const key = cityKey(state, city);
    const baseline = window.localStorage.getItem(bKey);
    if (!baseline) {
      window.localStorage.setItem(bKey, key);
      return;
    }
    if (baseline !== key) window.localStorage.setItem(sKey, "1");
  } catch {}
}

// Render-safe pure read.
export function hasSwitchedCity(userId: string | null | undefined): boolean {
  const sKey = switchedKey(userId);
  if (!sKey || typeof window === "undefined") return false;
  try { return window.localStorage.getItem(sKey) === "1"; } catch { return false; }
}
