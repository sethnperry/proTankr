"use client";
// lib/position/usePhoneMoving.ts
//
// While `active` (the "Are you still working?" question is about to be shown) and the screen is on, watch the phone's GPS
// once a minute. Moving (see movingNow) means the driver is plainly still working: the question is held back, and `onMoving`
// is called (at most every 20 minutes) so the shift records a still-working answer that also stops the server's push.

import { useEffect, useRef, useState } from "react";
import { getPhoneReading, phoneLocationDenied } from "./usePhoneReading";
import { movingNow, type PhoneReading } from "./phoneReading";

const EVERY_MS = 60_000;
const TELL_EVERY_MS = 20 * 60_000;

export function usePhoneMoving(active: boolean, onMoving?: () => void): boolean {
  const [moving, setMoving] = useState(false);
  const history = useRef<PhoneReading[]>([]);
  const told = useRef(0);
  const cb = useRef(onMoving);
  cb.current = onMoving;
  useEffect(() => {
    if (!active) { setMoving(false); history.current = []; return; }
    let off = false;
    let timer: number | undefined;
    const tick = async () => {
      if (!off && document.visibilityState !== "hidden" && !phoneLocationDenied()) {
        const r = await getPhoneReading();
        if (off) return;
        if (r) {
          history.current = [...history.current, r].slice(-12);
          const m = movingNow(history.current, Date.now());
          setMoving(m);
          if (m && Date.now() - told.current > TELL_EVERY_MS) { told.current = Date.now(); cb.current?.(); }
        }
      }
      if (!off) timer = window.setTimeout(tick, EVERY_MS);
    };
    void tick();
    return () => { off = true; if (timer) window.clearTimeout(timer); };
  }, [active]);
  return moving;
}
