"use client";
// app/planner/hooks/location/useAmbientTemp.ts
//
// Part of useLocation.ts: ambient temperature for the selected city, via /api/fuel-temp.

import { useEffect, useState } from "react";
import { normCity, normState } from "../../utils/normalize";


// ─── Ambient cache (per tab) ────────────────────────────────────────────────

type AmbientCacheEntry = { ts: number; tempF: number };
const AMBIENT_CACHE = new Map<string, AmbientCacheEntry>();
const AMBIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function ambientKey(state: string, city: string) {
  return `${normState(state)}|${normCity(city)}`;
}

export function useAmbientTemp(selectedState: string, selectedCity: string, selectedTerminalId: string) {
  const [ambientTempF, setAmbientTempF] = useState<number | null>(null);
  const [ambientTempLoading, setAmbientTempLoading] = useState(false);
  const [ambientHeartbeat, setAmbientHeartbeat] = useState(0);

  // ── Ambient temp via existing /api/fuel-temp (OpenWeather 3.0) ────────────
  // Stale-while-revalidate, not stale-and-trust: a cache hit is shown
  // immediately (instant paint, no loading flicker on a normal re-render),
  // but a real network fetch always fires too, regardless of the cache's
  // TTL. This used to return early on a cache hit and skip fetching
  // entirely -- which depended on *something* (a timer, visibilitychange,
  // pageshow, focus) eventually invalidating that cache to ever self-heal.
  // In practice, on at least one real device, none of those reliably fired
  // -- even a full app uninstall/reinstall didn't clear a stuck reading,
  // which points at the underlying browser tab/WebView process never
  // actually dying the way "closing the app" suggests it should (Android
  // PWA shortcuts don't necessarily map to the browser's own site storage
  // being cleared). Always revalidating on mount means correctness no
  // longer depends on guessing which lifecycle event this exact device
  // fires -- every visit to this page corrects itself within a second or
  // two of arriving, full stop.
  useEffect(() => {
    const city = String(selectedCity ?? "").trim();
    const state = String(selectedState ?? "").trim();

    if (!city || !state) {
      setAmbientTempF(null);
      setAmbientTempLoading(false);
      return;
    }

    const k = ambientKey(state, city);
    const cached = AMBIENT_CACHE.get(k);
    const hasFreshEnoughCache = !!cached && Date.now() - cached.ts < AMBIENT_TTL_MS;
    if (hasFreshEnoughCache) {
      // Paint instantly from cache while the real fetch below runs -- not a
      // substitute for it.
      setAmbientTempF(cached!.tempF);
    }

    const ac = new AbortController();
    setAmbientTempLoading(!hasFreshEnoughCache);

    (async () => {
      try {
        // IMPORTANT: Do NOT send ambientNowF here.
        // We want the server to fetch ambient from One Call 3.0 and return ambientNowF.
        const payload: any = { city, state };
        if (selectedTerminalId) payload.terminalId = String(selectedTerminalId);

        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: ac.signal,
          cache: "no-store",
        });

        const json: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? "Fuel temp route failed.");

        const amb = Number(json?.ambientNowF);

        if (Number.isFinite(amb)) {
          setAmbientTempF(amb);
          AMBIENT_CACHE.set(k, { ts: Date.now(), tempF: amb });
        } else {
          setAmbientTempF(null);
        }
      } catch {
        setAmbientTempF(null);
      } finally {
        setAmbientTempLoading(false);
      }
    })();

    return () => ac.abort();
  }, [selectedState, selectedCity, selectedTerminalId, ambientHeartbeat]);

  // ── Heartbeat to refresh ambient periodically ─────────────────────────────
  // setInterval alone isn't enough on mobile -- browsers routinely throttle
  // or fully suspend timers while a tab is backgrounded (screen locked, app
  // switched away, etc.), so a driver who leaves the Planner open in the
  // background for a while can come back to an ambient reading that's
  // stuck hours stale, well past this 5-minute interval's intent.
  //
  // visibilitychange alone turned out not to be enough either -- a "close
  // and reopen" on mobile is very often the browser's back-forward cache
  // (bfcache) resuming an already-alive, frozen page instead of a true
  // reload, and visibilitychange doesn't reliably fire for that. pageshow
  // with event.persisted===true is the actual signal for a bfcache
  // restore; `focus` is a third, cheap-to-add net for whatever either of
  // the other two misses. All three just call the same idempotent refresh.
  useEffect(() => {
    if (!selectedState || !selectedCity) return;
    const HEARTBEAT_MS = 5 * 60 * 1000; // 5 min
    const MIN_REFRESH_GAP_MS = 60 * 1000; // debounce for focus/visibility firing in a burst

    let lastRefreshAt = 0;
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshAt < MIN_REFRESH_GAP_MS) return;
      lastRefreshAt = now;
      const k = ambientKey(selectedState, selectedCity);
      AMBIENT_CACHE.delete(k);
      setAmbientHeartbeat((v) => v + 1);
    };

    const id = setInterval(refresh, HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    window.addEventListener("pageshow", onPageShow);

    window.addEventListener("focus", refresh);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", refresh);
    };
  }, [selectedState, selectedCity]);

  return { ambientTempF, ambientTempLoading };
}
