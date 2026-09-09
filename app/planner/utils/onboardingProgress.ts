// onboardingProgress.ts
// Small localStorage helpers for the solo first-run onboarding flow
// (app/planner/components/SoloOnboarding.tsx). Mirrors the per-user-keyed,
// try/catch-wrapped, SSR-safe style of utils/activePlannedLoad.ts.
//
// Two of these are just one-time "seen" flags; the third is a resume draft for
// the trailer/compartment sub-steps, which aren't committed to the DB until
// every capacity is entered (we insert the trailer + all its compartments in a
// single commit at the end of the safety-cap screen). Everything ELSE the flow
// needs to resume is derived from real DB/shell state, not stored here -- so a
// stale flag can only ever cost a re-show of a harmless step, never data.

export type TrailerDraft = {
  trailerNumber: string;
  compCount: number;
  // caps[i] is compartment (i+1)'s TOTAL capacity in gallons; undefined until
  // that compartment has been entered. Index into this drives "Compartment
  // N of M".
  caps: (number | undefined)[];
  savedAt: number;
};

function completeKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:onboardingComplete`;
}
function tutorialKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:onboardingTutorialSeen`;
}
function trailerDraftKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `proTankr:u:${userId}:onboardingTrailerDraft`;
}

function readFlag(key: string | null): boolean {
  if (!key || typeof window === "undefined") return false;
  try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeFlag(key: string | null): void {
  if (!key || typeof window === "undefined") return;
  try { window.localStorage.setItem(key, "1"); } catch {}
}

export function isOnboardingComplete(userId: string | null | undefined): boolean {
  return readFlag(completeKey(userId));
}
export function markOnboardingComplete(userId: string | null | undefined): void {
  writeFlag(completeKey(userId));
}

export function isTutorialSeen(userId: string | null | undefined): boolean {
  return readFlag(tutorialKey(userId));
}
export function markTutorialSeen(userId: string | null | undefined): void {
  writeFlag(tutorialKey(userId));
}

export function readTrailerDraft(userId: string | null | undefined): TrailerDraft | null {
  const k = trailerDraftKey(userId);
  if (!k || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(k);
    if (!raw) return null;
    const v = JSON.parse(raw) as TrailerDraft;
    return v && Array.isArray(v.caps) ? v : null;
  } catch { return null; }
}
export function writeTrailerDraft(
  userId: string | null | undefined,
  v: Omit<TrailerDraft, "savedAt">
): void {
  const k = trailerDraftKey(userId);
  if (!k || typeof window === "undefined") return;
  try { window.localStorage.setItem(k, JSON.stringify({ ...v, savedAt: Date.now() })); } catch {}
}
export function clearTrailerDraft(userId: string | null | undefined): void {
  const k = trailerDraftKey(userId);
  if (!k || typeof window === "undefined") return;
  try { window.localStorage.removeItem(k); } catch {}
}
