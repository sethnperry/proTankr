"use client";
// lib/pwa/keepAwake.ts
//
// Keeps the screen on while the app is open, so the dashboard can sit in the truck like another gauge. It uses the
// browser's Screen Wake Lock. The lock is released by the system whenever the page is hidden (the driver pressed the
// power button, switched apps), and the screen then sleeps normally; it is asked for again when the app is back on
// screen. So "stays awake unless put to sleep by hand" needs no extra rule. On by default; a driver can turn it off
// in Settings. The browser can refuse it (battery saver, some devices): the setting says so.

import { useEffect, useState } from "react";

const KEY = "proTankr:keepAwake";
const EVENT = "protankr:keepawake";

export const keepAwakeSupported = () => typeof navigator !== "undefined" && "wakeLock" in navigator;
export function readKeepAwake(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}
export function writeKeepAwake(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* storage blocked: it applies until reload */ }
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* not a browser */ }
}

export function useKeepAwake(): { on: boolean; supported: boolean; held: boolean } {
  const [on, setOn] = useState(true);
  const [held, setHeld] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(keepAwakeSupported());
    setOn(readKeepAwake());
    const h = () => setOn(readKeepAwake());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  useEffect(() => {
    if (!on || !keepAwakeSupported()) { setHeld(false); return; }
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const acquire = async () => {
      if (gone || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { if (!gone) setHeld(false); });
        setHeld(true);
      } catch { setHeld(false); } // refused: low battery, battery saver, not allowed here
    };
    void acquire();
    const vis = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", vis);
    return () => { gone = true; document.removeEventListener("visibilitychange", vis); void lock?.release().catch(() => {}); };
  }, [on]);
  return { on, supported, held };
}
