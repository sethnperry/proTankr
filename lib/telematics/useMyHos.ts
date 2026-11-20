"use client";
// lib/telematics/useMyHos.ts
//
// The signed-in driver's own hours of service, for the Driver Dashboard. Polls every five minutes while `enabled` and the
// tab is visible. Null when there is no telematics link, no matching Geotab driver, or HOS isn't on for them.
//
// Three caches sit between Geotab and this card (this poll, the server's 90 seconds, Geotab's own five minutes), so a duty
// status the driver changes in Drive could take ten minutes to show. Two ways to catch up quickly, both asking the server
// for a fresh read (which it allows at most every 30 seconds per driver):
//  - coming back to the app (it was in the background) reads fresh once;
//  - requestHosRefresh({ chaseMin }) reads fresh now and keeps reading every 45 seconds, up to chaseMin minutes, until the
//    status is no longer on duty or driving. The End shift flow uses it so the card follows the driver's change to Off duty.

import { tfetch } from "./switch";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HosAvailability } from "./types";
import { linkMeToTelematics } from "./linkMe";

const REFRESH_EVENT = "protankr:hos-refresh";
const CHASE_EVERY_MS = 45_000;
const ON_DUTY = new Set(["D", "ON", "YM"]);

/** Read the driver's hours fresh now, and (with chaseMin) keep reading until they are no longer on duty or driving. */
export function requestHosRefresh(o?: { chaseMin?: number }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: o ?? {} }));
}

export function useMyHos(companyId: string | null, enabled: boolean): HosAvailability | null {
  const [hos, setHos] = useState<HosAvailability | null>(null);
  useEffect(() => {
    if (!companyId || !enabled) return;
    let off = false;
    let timer: number | undefined;
    let linked = false;
    let wait = 300_000;
    let misses = 0;
    let chaseUntil = 0;
    const run = async (fresh = false) => {
      if (timer) { window.clearTimeout(timer); timer = undefined; }
      const chasing = Date.now() < chaseUntil;
      if (document.visibilityState !== "hidden") {
        try {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) return;
          // First look each time the dashboard opens: link this driver to Geotab if they match.
          if (!linked) { linked = true; await linkMeToTelematics(companyId); }
          const r = await tfetch(`/api/telematics/hos?companyId=${encodeURIComponent(companyId)}&self=1&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "")}${fresh || chasing ? "&fresh=1" : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
          if (!r.ok) {
            // A failed answer (Geotab busy, a server hiccup) is not "no telematics": keep the last
            // reading and ask again, instead of going quiet until the app is reopened.
            if (!off) timer = window.setTimeout(() => void run(), chasing ? CHASE_EVERY_MS : 300_000);
            return;
          }
          const j = await r.json();
          if (off) return;
          if (!j?.connected) { setHos(null); return; } // no telematics: stop asking
          // No hours yet (not linked, or Geotab didn't answer this time): keep asking every two
          // minutes for a while, so one bad answer doesn't hide the card for ten.
          if (!j.hos) { misses += 1; wait = misses <= 5 ? 300_000 : 600_000; }
          else {
            misses = 0; setHos(j.hos as HosAvailability); wait = 300_000;
            // Chasing a status change: stop once the driver is off duty (or sleeping), else look again soon.
            if (chasing && j.hos.status && !ON_DUTY.has(j.hos.status)) chaseUntil = 0;
          }
        } catch { /* keep the last reading */ }
      }
      if (!off) timer = window.setTimeout(() => void run(), Date.now() < chaseUntil ? CHASE_EVERY_MS : wait);
    };
    const onRefresh = (e: Event) => {
      const mins = Number((e as CustomEvent<{ chaseMin?: number }>).detail?.chaseMin ?? 0);
      if (mins > 0) chaseUntil = Date.now() + mins * 60_000;
      void run(true);
    };
    const onVisible = () => { if (document.visibilityState === "visible") void run(true); };
    window.addEventListener(REFRESH_EVENT, onRefresh);
    document.addEventListener("visibilitychange", onVisible);
    void run();
    return () => { off = true; if (timer) window.clearTimeout(timer); window.removeEventListener(REFRESH_EVENT, onRefresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [companyId, enabled]);
  return hos;
}
