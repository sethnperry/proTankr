// lib/vault/guard.ts
//
// Vault safeguards that don't change how the data is stored: a wait after repeated wrong patterns, and when
// to lock on its own. Pure, so the rules can be tested. The wrong-pattern count lives on the phone, so it
// slows down someone holding the phone; it is not a server-side limit.

export const FREE_TRIES = 5;
export const IDLE_LOCK_MS = 3 * 60 * 1000;
export const BACKGROUND_LOCK_MS = 60 * 1000;
export const CLIPBOARD_CLEAR_MS = 30 * 1000;

/** How long to wait after this many wrong patterns in a row: none for the first five, then 30 s, doubling to 15 min. */
export function lockoutMs(failures: number): number {
  if (failures < FREE_TRIES) return 0;
  return Math.min(15 * 60 * 1000, 30_000 * 2 ** (failures - FREE_TRIES));
}

export type FailState = { count: number; until: number };

export function recordFailure(prev: FailState, now: number): FailState {
  const count = prev.count + 1;
  return { count, until: now + lockoutMs(count) };
}

/** Milliseconds still to wait, 0 when free to try. */
export function waitLeft(s: FailState, now: number): number {
  return Math.max(0, s.until - now);
}

/** Lock because the app sat in the background (or the phone was off) longer than the allowance. */
export function shouldLockAfterHidden(hiddenAt: number, now: number): boolean {
  return now - hiddenAt >= BACKGROUND_LOCK_MS;
}

export const fmtWait = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
