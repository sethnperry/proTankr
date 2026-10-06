// app/planner/utils/tourProgress.ts
//
// One-time "seen" flags for the look-here tours (Setup Guide + the first-
// open Plan Review walkthrough) -- same per-user-keyed, try/catch-wrapped,
// SSR-safe style as onboardingProgress.ts. These are genuinely sticky,
// write-once flags, not derived from live state: "has this driver ever
// acknowledged the setup guide" / "has this driver ever seen the Plan
// Review walkthrough" are one-time-demonstration facts, not something
// that should flip back and forth the way the checklist's own done/
// pending state does.

function setupGuideKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:setupGuideAcknowledged`;
}
function planReviewTourKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:planReviewTourSeen`;
}

function readFlag(key: string | null): boolean {
  if (!key || typeof window === "undefined") return false;
  try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try { window.localStorage.setItem(key, "1"); } catch {}
}

// Written once the driver dismisses the Setup Guide's closing message --
// not the instant all three steps go done, so the message stays visible
// (and re-showable on a reload) until actually acknowledged. The Learn
// page's "Guided tours" recap reads this same flag to know whether to
// show a completed entry.
export function isSetupGuideAcknowledged(userId: string | null | undefined): boolean {
  return readFlag(setupGuideKey(userId));
}
export function markSetupGuideAcknowledged(userId: string | null | undefined): void {
  writeFlag(setupGuideKey(userId));
}

export function isPlanReviewTourSeen(userId: string | null | undefined): boolean {
  return readFlag(planReviewTourKey(userId));
}
export function markPlanReviewTourSeen(userId: string | null | undefined): void {
  writeFlag(planReviewTourKey(userId));
}
