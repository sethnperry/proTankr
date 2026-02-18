"use client";
// hooks/useLocation.ts
// Owns: states/cities catalogs, selected state/city, ambient temp, localStorage persistence.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { normCity, normState } from "../utils/normalize";
import type { CityRow, StateRow } from "../types";

// ─── Ambient temp cache (module-scope, per tab session) ───────────────────────

const AMBIENT_CACHE = new Map<string, { ts: number; tempF: number }>();
const AMBIENT_TTL_MS = 15 * 60 * 1000;

function ambientKey(state: string, city: string) {
  return `${normState(state)}|${normCity(city)}`;
}

async function fetchAmbientTempF(args: {
  state: string;
  city: string;
  apiKey: string;
  signal: AbortSignal;
}): Promise<number | null> {
  const { state, city, apiKey, signal } = args;
  const qCity = city.trim();
  const qState = state.trim();
  if (!qCity || !qState || !apiKey) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(qCity)},${encodeURIComponent(qState)},US&units=imperial&appid=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal, cache: "no-store" });
    if (res.ok) {
      const json: any = await res.json();
      const temp = Number(json?.main?.temp);
      if (Number.isFinite(temp)) return temp;
    }
  } catch {}

  try {
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(qCity)},${encodeURIComponent(qState)},US&limit=1&appid=${encodeURIComponent(apiKey)}`;
    const geoRes = await fetch(geoUrl, { signal, cache: "no-store" });
    if (!geoRes.ok) return null;
    const geoJson: any = await geoRes.json();
    const item = Array.isArray(geoJson) ? geoJson[0] : null;
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const wUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${encodeURIComponent(apiKey)}`;
    const wRes = await fetch(wUrl, { signal, cache: "no-store" });
    if (!wRes.ok) return null;
    const wJson: any = await wRes.json();
    const temp2 = Number(wJson?.main?.temp);
    return Number.isFinite(temp2) ? temp2 : null;
  } catch {
    return null;
  }
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const ANON_LOC_KEY = "protankr_location_v2:anon";
const LEGACY_LOC_KEY = "protankr_location_v1";

function locKey(userId: string) {
  return `protankr_location_v2:${userId || "anon"}`;
}

function readPersistedLocation(key: string): { state: string; city: string; terminalId: string } | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const st = normState((parsed as any).state || "");
    const ct = normCity((parsed as any).city || "");
    const tid = String((parsed as any).terminalId || "");
    if (!st) return null;
    return { state: st, city: ct, terminalId: tid };
  } catch {
    return null;
  }
}

function writePersistedLocation(key: string, state: string, city: string, terminalId: string) {
  try {
    localStorage.setItem(key, JSON.stringify({
      state: normState(state),
      city: normCity(city),
      terminalId: String(terminalId || ""),
    }));
  } catch {}
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocation(authUserId: string) {
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedTerminalId, setSelectedTerminalId] = useState("");

  const [statesCatalog, setStatesCatalog] = useState<StateRow[]>([]);
  const [statesLoading, setStatesLoading] = useState(false);
  const [statesError, setStatesError] = useState<string | null>(null);

  const [citiesCatalog, setCitiesCatalog] = useState<CityRow[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);

  const [ambientTempF, setAmbientTempF] = useState<number | null>(null);
  const [ambientTempLoading, setAmbientTempLoading] = useState(false);

  // Hydration refs — prevent clobber during boot/auth flip
  const skipResetRef = useRef(false);
  const hydratingRef = useRef(false);
  const hydratedOnceRef = useRef(false);
  const hydratedForKeyRef = useRef("");
  const userTouchedRef = useRef(false);
  const citiesLoadedForStateRef = useRef("");

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

  // ── Fetch cities when state changes ──────────────────────────────────────

  useEffect(() => {
    (async () => {
      setCitiesError(null);
      if (!selectedState) { setCitiesCatalog([]); return; }
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

  // Track when cities have loaded for current state
  useEffect(() => {
    if (!selectedState || citiesLoading) return;
    citiesLoadedForStateRef.current = normState(selectedState);
  }, [selectedState, citiesLoading, citiesCatalog]);

  // ── Reset city/terminal on state change ───────────────────────────────────

  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedCity("");
    setSelectedTerminalId("");
  }, [selectedState]);

  useEffect(() => {
    if (skipResetRef.current) return;
    setSelectedTerminalId("");
  }, [selectedCity]);

  // ── Restore persisted location ────────────────────────────────────────────

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
    }

    if (authUserId && !fromUser && fromAnon) {
      writePersistedLocation(userLocKey, fromAnon.state, fromAnon.city, fromAnon.terminalId);
    }

    setTimeout(() => {
      skipResetRef.current = false;
      hydratingRef.current = false;
      hydratedOnceRef.current = true;
      hydratedForKeyRef.current = effectiveLocKey;
    }, 50);
  }, [authUserId, effectiveLocKey, userLocKey]);

  // Mark user-touched after hydration
  useEffect(() => {
    if (!hydratedOnceRef.current) return;
    if (hydratingRef.current) return;
    if (skipResetRef.current) return;
    userTouchedRef.current = true;
  }, [selectedState, selectedCity, selectedTerminalId]);

  // ── Persist on change ─────────────────────────────────────────────────────

  useEffect(() => {
    if (hydratedForKeyRef.current !== effectiveLocKey) return;
    if (hydratingRef.current) return;
    writePersistedLocation(ANON_LOC_KEY, selectedState, selectedCity, selectedTerminalId);
    if (authUserId && userLocKey) {
      writePersistedLocation(userLocKey, selectedState, selectedCity, selectedTerminalId);
    }
  }, [authUserId, effectiveLocKey, userLocKey, selectedState, selectedCity, selectedTerminalId]);

  // ── Ambient temp ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedState || !selectedCity) {
      setAmbientTempF(null);
      setAmbientTempLoading(false);
      return;
    }

    const apiKey = (process.env.NEXT_PUBLIC_OPENWEATHER_KEY || "").trim();
    if (!apiKey) { setAmbientTempF(null); return; }

    const cacheKey = ambientKey(selectedState, selectedCity);
    const cached = AMBIENT_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < AMBIENT_TTL_MS) {
      setAmbientTempF(cached.tempF);
      setAmbientTempLoading(false);
      return;
    }

    const ac = new AbortController();
    setAmbientTempLoading(true);

    (async () => {
      try {
        const temp = await fetchAmbientTempF({
          state: selectedState, city: selectedCity, apiKey, signal: ac.signal,
        });
        if (typeof temp === "number" && Number.isFinite(temp)) {
          setAmbientTempF(temp);
          AMBIENT_CACHE.set(cacheKey, { ts: Date.now(), tempF: temp });
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

  return {
    selectedState, setSelectedState,
    selectedCity, setSelectedCity,
    selectedTerminalId, setSelectedTerminalId,
    selectedCityId,
    locationLabel,
    statesCatalog, statesLoading, statesError,
    citiesCatalog, citiesLoading, citiesError,
    ambientTempF, ambientTempLoading,
    skipResetRef,
  };
}
