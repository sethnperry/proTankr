// lib/vault/session.ts
//
// The unlocked vault key, held in memory only (never written to storage). A page reload, a lock, or leaving
// the app clears it. While it is held it locks itself: after a few minutes without a tap, or after the app
// has been in the background for a minute. Other screens (the fuel screen) can use the key while it's there.

import { BACKGROUND_LOCK_MS, IDLE_LOCK_MS, shouldLockAfterHidden } from "./guard";

let key: CryptoKey | null = null;
const listeners = new Set<() => void>();
let stopGuard: (() => void) | null = null;

export const getVaultKey = () => key;
/** When the idle lock will fire (epoch ms), or null when locked. For a countdown on screen. */
export const getLockAt = () => lockAt;
let lockAt: number | null = null;
export function onVaultKeyChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

export function setVaultKey(k: CryptoKey | null) {
  key = k;
  stopGuard?.(); stopGuard = null;
  if (!k) lockAt = null;
  if (k && typeof window !== "undefined") stopGuard = startGuard();
  listeners.forEach((f) => f());
}

function startGuard(): () => void {
  const lock = () => setVaultKey(null);
  let idle = window.setTimeout(lock, IDLE_LOCK_MS);
  lockAt = Date.now() + IDLE_LOCK_MS;
  const bump = () => { window.clearTimeout(idle); idle = window.setTimeout(lock, IDLE_LOCK_MS); lockAt = Date.now() + IDLE_LOCK_MS; };
  let hiddenAt = 0;
  const vis = () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt && shouldLockAfterHidden(hiddenAt, Date.now())) lock();
    else bump();
  };
  const evs = ["pointerdown", "keydown", "scroll", "touchstart"];
  evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
  document.addEventListener("visibilitychange", vis);
  return () => {
    window.clearTimeout(idle);
    evs.forEach((e) => window.removeEventListener(e, bump));
    document.removeEventListener("visibilitychange", vis);
  };
}

export { BACKGROUND_LOCK_MS };
