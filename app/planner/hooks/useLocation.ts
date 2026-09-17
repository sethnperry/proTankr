"use client";
// app/planner/hooks/useLocation.ts
// Owns: states/cities catalogs, selected state/city, ambient temp, persistence.
// Ambient is sourced from existing /api/fuel-temp (OpenWeather One Call 3.0 server-side).

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { normCity, normState } from "../utils/normalize";
import { readActivePlannedLoad } from "../utils/activePlannedLoad";
import type { CityRow, StateRow } from "../types";

// ─── Ambient cache (per tab) ────────────────────────────────────────────────

type AmbientCacheEntry = { ts: number; tempF: number };
const AMBIENT_CACHE = new Map<string, AmbientCacheEntry>();
const AMBIENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

function ambientKey(state: string, city: string) {
  return `${normState(state)}|${normCity(city)}`;
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

const ANON_LOC_KEY = "protankr_location_v2:anon";
const LEGACY_LOC_KEY = "protankr_location_v1";

function locKey(userId: string) {
  return `protankr_location_v2:${userId || "anon"}`;
}

function readPersistedLocation(key: string): { state: string; city: string; terminalId: string; rackId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const st = normState((parsed as any).state || "");
    const ct = normCity((parsed as any).city || "");
    const tid = String((parsed as any).terminalId || "");
    const rid = String((parsed as any).rackId || "");
    if (!st) return null;
    return { state: st, city: ct, terminalId: tid, rackId: rid };
  } catch {
    return null;
  }
}

function writePersistedLocation(key: string, state: string, city: string, terminalId: string, rackId: string) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        state: normState(state),
        city: normCity(city),
        terminalId: String(terminalId || ""),
        rackId: String(rackId || ""),
      })
    );
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocation(authUserId: string) {
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  // Which physical rack at selectedTerminalId the driver is loading at --
  // "" means either the terminal has 0/1 racks (nothing to disambiguate) or
  // a rack hasn't been chosen yet for a multi-rack terminal. See CLAUDE.md
  // "rack-aware loading" discussion: without this, actual API/temp readings
  // from different racks at the same terminal silently pool into one number.
  const [selectedRackId, setSelectedRackId] = useState("");

  const [statesCatalog, setStatesCatalog] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);

  const [citiesCatalog, setCitiesCatalog] = useState<CityRow[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [ambientTempF, setAmbientTempF] = useState<number | null>(null);
  const [ambientTempLoading, setAmbientTempLoading] = useState(false);
  const [ambientHeartbeat, setAmbientHeartbeat] = useState(0);

  // Hydration refs — prevent clobber during boot/auth flip
  const skipResetRef = useRef(false);
  const hydratingRef = useRef(false);
  const hydratedOnceRef = useRef(false);
  const hydratedForKeyRef = useRef("");
  const userTouchedRef = useRef(false);

  const userLocKey = useMemo(() => locKey(authUserId), [authUserId]);
  const effectiveLocKey = authUserId ? userLocKey : ANON_LOC_KEY;

  // ── Fetch states ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setStatesError(null);
      setStatesLoading(true);
      const { data, error } = await supabase
        .from("states")
        .select("state_code, state_name, active")
        .order("state_code", { ascending: true })
        .returns<StateRow[]>();
      if (error) {
        setStatesError(error.message);
        setStatesCatalog([]);
      } else {
        setStatesCatalog((data ?? []).filter((r) => r.active !== false));
      }
      setStatesLoading(false);
    })();
  }, []);

  // ── Fetch cities when state changes ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      setCitiesError(null);
      if (!selectedState) {
        setCitiesCatalog([]);
        return;
      }
      setCitiesLoading(true);
      const { data, error } = await supabase
        .from("cities")
        .select("city_id, state_code, city_name, active")
        .eq("state_code", normState(selectedState))
        .neq("active", false)
        .order("city_name", { ascending: true })
        .returns<CityRow[]>();
      if (error) {
        setCitiesError(error.message);
        setCitiesCatalog([]);
      } else {
        setCitiesCatalog((data ?? []).filter((r) => r.city_name));
      }
      setCitiesLoading(false);
    })();
  }, [selectedState]);

  // ── Reset city/terminal/rack on state change ──────────────────────────────
  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedCity("");
    setSelectedTerminalId("");
    setSelectedRackId("");
  }, [selectedState]);

  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedTerminalId("");
    setSelectedRackId("");
  }, [selectedCity]);

  // NOTE: deliberately no separate effect resetting selectedRackId off of
  // selectedTerminalId alone -- the rack-selection flow (ShellChrome, see
  // CLAUDE.md "rack-aware loading") needs to set terminalId and its
  // resolved rackId together, atomically, in one handler; an effect
  // reacting to the terminalId change alone would fire after that same
  // batch and immediately clobber the rackId it just set back to "".
  // Every call site that sets selectedTerminalId without also knowing
  // about racks (persisted-location restore below, the dispatch/admin
  // Cards-tab contextual picker) is responsible for clearing rackId itself.

  // ── Restore persisted location ───────────────────────────────────────────
  useEffect(() => {
    if (userTouchedRef.current) return;
    if (hydratedForKeyRef.current === effectiveLocKey) return;

    const fromUser = authUserId ? readPersistedLocation(userLocKey) : null;
    const fromAnon = readPersistedLocation(ANON_LOC_KEY);
    const fromLegacy = readPersistedLocation(LEGACY_LOC_KEY);
    const loc = fromUser || (authUserId ? fromAnon : null) || fromAnon || fromLegacy;

    hydratingRef.current = true;
    skipResetRef.current = true;

    if (loc?.state) {
      setSelectedState(loc.state);
      setSelectedCity(loc.city || "");
      setSelectedTerminalId(loc.terminalId || "");
      // Restored as-is (written together with terminalId, see the persist
      // effect below) -- the consumer that reads terminal_racks for this
      // terminal is responsible for treating a stale/deleted rack id
      // gracefully (fall back to re-prompting) rather than trusting it blind.
      setSelectedRackId(loc.rackId || "");
    }

    if (authUserId && !fromUser && fromAnon) {
      writePersistedLocation(userLocKey, fromAnon.state, fromAnon.city, fromAnon.terminalId, fromAnon.rackId);
    }

    setTimeout(() => {
      skipResetRef.current = false;
      hydratingRef.current = false;
      hydratedOnceRef.current = true;
      hydratedForKeyRef.current = effectiveLocKey;
    }, 50);
  }, [authUserId, effectiveLocKey, userLocKey]);

  // ── Snap fresh mount/reload to the most recent REAL load's terminal --
  // ONLY when there's no ordinary persisted location to fall back on ────
  // Originally (2026-08-28) this unconditionally overrode the plain
  // persisted-location restore above, on the reasoning that "casually
  // browsing a terminal" shouldn't get stuck as next launch's starting
  // point. In real day-to-day use this turned out to be the far more
  // disruptive failure mode, reported directly: a driver sets up their
  // NEXT load (location, terminal, plan) but hasn't tapped LOAD yet, the
  // app refreshes for any reason (backgrounding, a network blip, mobile
  // memory pressure), and that in-progress setup gets silently discarded
  // back to wherever their last COMPLETED load happened -- forcing them
  // to redo location + plan every time. Reversed: a normal persisted
  // location (the restore effect above already found one) is now trusted
  // as-is, exactly "reload to the last condition it was in right before
  // refresh or closing." The completed-load fallback only fires for a
  // genuinely fresh device/session with NOTHING persisted yet -- still
  // better than a blank picker on a driver's very first launch.
  //
  // Runs once per hydration (loadLocationSyncRef), same shape as the
  // persisted-location restore above. Combo-independent on purpose
  // ("wherever my most recent load was," not scoped to whichever
  // equipment happens to be selected right now) -- this hook doesn't know
  // about equipment at all, and the ask itself wasn't equipment-scoped.
  const loadLocationSyncRef = useRef("");
  useEffect(() => {
    if (!authUserId) return;
    if (loadLocationSyncRef.current === effectiveLocKey) return;
    loadLocationSyncRef.current = effectiveLocKey;

    // If the driver has a load IN PROGRESS (begin_load ran, not completed --
    // see activePlannedLoad), reopening should return them to THAT load's
    // terminal, not snap to their most recent COMPLETED load's terminal. The
    // in-progress plan is resumed alongside (usePlanSlots' matching skip-
    // discard), and keeping the terminal consistent with it means the plan's
    // products stay available rather than reading as "not sold here." This
    // is a stronger, more specific signal than "last thing the picker
    // showed," so it still takes priority even over an ordinary persisted
    // location below.
    const active = readActivePlannedLoad(authUserId);
    if (active?.state) {
      hydratingRef.current = true;
      skipResetRef.current = true;
      setSelectedState(active.state);
      setSelectedCity(active.city || "");
      setSelectedTerminalId(active.terminalId || "");
      setSelectedRackId(active.rackId || "");
      setTimeout(() => {
        skipResetRef.current = false;
        hydratingRef.current = false;
      }, 50);
      return;
    }

    // An ordinary persisted location already exists (whatever the driver
    // last had set, right before this refresh/reopen) -- trust it as-is,
    // don't second-guess it against load history. Read directly from
    // localStorage rather than the selectedState/selectedCity React state
    // here: the restore effect above updates that state via setState in
    // the same tick, which isn't guaranteed to be visible yet from this
    // effect's own closure.
    const fromUser = authUserId ? readPersistedLocation(userLocKey) : null;
    const fromAnon = readPersistedLocation(ANON_LOC_KEY);
    if (fromUser?.state || fromAnon?.state) return;

    (async () => {
      const { data: rows } = await supabase
        .from("load_log")
        .select("terminal_id, rack_id, started_at")
        .eq("user_id", authUserId)
        .eq("status", "loaded")
        .order("started_at", { ascending: false })
        .limit(1);
      const row = rows?.[0] as any;
      const terminalId = row?.terminal_id ? String(row.terminal_id) : "";
      if (!terminalId) return;

      const { data: termRow } = await supabase
        .from("terminals")
        .select("city, state")
        .eq("terminal_id", terminalId)
        .maybeSingle();
      const city = (termRow as any)?.city ? normCity(String((termRow as any).city)) : "";
      const state = (termRow as any)?.state ? normState(String((termRow as any).state)) : "";
      if (!state) return;

      hydratingRef.current = true;
      skipResetRef.current = true;
      setSelectedState(state);
      setSelectedCity(city);
      setSelectedTerminalId(terminalId);
      setSelectedRackId(row?.rack_id ? String(row.rack_id) : "");
      setTimeout(() => {
        skipResetRef.current = false;
        hydratingRef.current = false;
      }, 50);
    })();
  }, [authUserId, effectiveLocKey, userLocKey]);

  // Mark user-touched after hydration
  useEffect(() => {
    if (!hydratedOnceRef.current) return;
    if (hydratingRef.current) return;
    if (skipResetRef.current) return;
    userTouchedRef.current = true;
  }, [selectedState, selectedCity, selectedTerminalId, selectedRackId]);

  // ── Persist on change ─────────────────────────────────────────────────────
  useEffect(() => {
    if (hydratedForKeyRef.current !== effectiveLocKey) return;
    if (hydratingRef.current) return;

    writePersistedLocation(ANON_LOC_KEY, selectedState, selectedCity, selectedTerminalId, selectedRackId);
    if (authUserId && userLocKey) {
      writePersistedLocation(userLocKey, selectedState, selectedCity, selectedTerminalId, selectedRackId);
    }
  }, [authUserId, effectiveLocKey, userLocKey, selectedState, selectedCity, selectedTerminalId, selectedRackId]);

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

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedCityId = useMemo<string | null>(() => {
    if (!selectedState || !selectedCity) return null;
    const st = normState(selectedState);
    const ct = normCity(selectedCity);
    const row = citiesCatalog.find(
      (c) => normState(String(c.state_code ?? "")) === st && normCity(String(c.city_name ?? "")) === ct
    );
    return row?.city_id ? String(row.city_id) : null;
  }, [citiesCatalog, selectedState, selectedCity]);

  const locationLabel = useMemo(
    () => (selectedCity && selectedState ? `${selectedCity}, ${selectedState}` : undefined),
    [selectedCity, selectedState]
  );

  // Memoized so this hook returns a stable reference across renders where
  // nothing it owns actually changed -- every field here is already a raw
  // useState value/setter (React-stable by construction), an already-
  // memoized derived value, or a ref (identity-stable by definition), so
  // this can only stabilize the wrapper object itself, never mask a real
  // change. See useEquipment.ts's identical comment for why this matters
  // (CalculatorShellContext.tsx spreads this into its own memoized value).
  return useMemo(() => ({
    selectedState,
    setSelectedState,
    selectedCity,
    setSelectedCity,
    selectedTerminalId,
    setSelectedTerminalId,
    selectedRackId,
    setSelectedRackId,
    selectedCityId,
    locationLabel,
    statesCatalog,
    statesLoading,
    statesError,
    citiesCatalog,
    citiesLoading,
    citiesError,
    ambientTempF,
    ambientTempLoading,
    skipResetRef,
  }), [
    selectedState, setSelectedState, selectedCity, setSelectedCity,
    selectedTerminalId, setSelectedTerminalId, selectedRackId, setSelectedRackId,
    selectedCityId, locationLabel, statesCatalog, statesLoading, statesError,
    citiesCatalog, citiesLoading, citiesError, ambientTempF, ambientTempLoading, skipResetRef,
  ]);
}