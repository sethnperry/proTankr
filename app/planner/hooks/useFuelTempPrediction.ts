"use client";
// app/planner/hooks/useFuelTempPrediction.ts

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type FuelTempConfidence = "high" | "medium" | "low";

type Input = {
  city?: string | null;
  state?: string | null;
  terminalId?: string | null; // optional — used for the per-terminal bias lookup only
};

type Output = {
  predictedFuelTempF: number | null;
  confidence: FuelTempConfidence | null;
  loading: boolean;
  error: string | null;

  // Resolved from the API response, city-level.
  ambientNowF: number | null;
  // The model's own prediction BEFORE the learned per-terminal bias is
  // added. The self-training write (useLoadWorkflow) must measure error
  // against this, not the final prediction -- see the note there.
  unbiasedPredictionF: number | null;
  // Fetch again now, skipping the throttle -- e.g. right after a load is
  // logged, so the new reading anchors the next plan immediately.
  refresh: () => void;
};

function isFiniteNumber(v: any): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function useFuelTempPrediction(input: Input): Output {
  const { city, state, terminalId } = input;

  const [predictedFuelTempF, setPredictedFuelTempF] = useState<number | null>(null);
  const [unbiasedPredictionF, setUnbiasedPredictionF] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<FuelTempConfidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ambientResolvedF, setAmbientResolvedF] = useState<number | null>(null);

  const lastCallAtRef = useRef<number>(0);
  const lastSigRef = useRef<string>("");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const refresh = useCallback(() => {
    lastSigRef.current = "";
    lastCallAtRef.current = 0;
    setRefreshNonce((n) => n + 1);
  }, []);

  const normalized = useMemo(() => {
    const c = String(city ?? "").trim();
    const s = String(state ?? "").trim();
    return { c, s };
  }, [city, state]);

  useEffect(() => {
    const { c, s } = normalized;
    const ready = !!c && !!s;

    if (!ready) {
      setPredictedFuelTempF(null);
      setConfidence(null);
      setError(null);
      setAmbientResolvedF(null);
      return;
    }

    // Build a signature so we refetch when meaningful inputs change.
    const sig = [`city=${c.toLowerCase()}`, `state=${s.toLowerCase()}`, terminalId ? `terminal=${String(terminalId)}` : ""]
      .filter(Boolean)
      .join("&");

    const now = Date.now();
    const minIntervalMs = 30_000;

    const sigChanged = sig !== lastSigRef.current;
    const tooSoon = now - lastCallAtRef.current < minIntervalMs;

    // If nothing changed and we're within the throttle window, skip.
    if (!sigChanged && tooSoon) return;

    lastSigRef.current = sig;
    lastCallAtRef.current = now;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const payload: any = { city: c, state: s };
        if (terminalId) payload.terminalId = terminalId;

        const res = await fetch("/api/fuel-temp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Fuel temp prediction failed.");

        if (cancelled) return;

        setPredictedFuelTempF(isFiniteNumber(json?.predictedFuelTempF) ? json.predictedFuelTempF : null);
        // rawPredictionF is the model before bias (added 2026-09-27); an older
        // server only sends biasApplied, so back it out of the final value.
        setUnbiasedPredictionF(
          isFiniteNumber(json?.rawPredictionF)
            ? json.rawPredictionF
            : isFiniteNumber(json?.predictedFuelTempF)
              ? json.predictedFuelTempF - (isFiniteNumber(json?.biasApplied) ? json.biasApplied : 0)
              : null
        );
        setConfidence((json?.confidence as FuelTempConfidence) ?? null);
        setAmbientResolvedF(isFiniteNumber(json?.ambientNowF) ? json.ambientNowF : null);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Error");
        setPredictedFuelTempF(null);
        setUnbiasedPredictionF(null);
        setConfidence(null);
        setAmbientResolvedF(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    // Periodic re-fetch -- previously this effect only ever ran again when
    // city/state/terminal changed, so a driver who left the app open for
    // hours (temp genuinely drifting the whole time) kept seeing whatever
    // was predicted at mount, e.g. an early-morning reading well into the
    // afternoon. Re-triggers run() on a timer without waiting for a real
    // input change -- resets the throttle bookkeeping first so the 30s
    // "tooSoon" guard above (meant to collapse rapid input changes, not to
    // block an intentional scheduled refresh) doesn't skip it.
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
    const intervalId = setInterval(() => {
      lastSigRef.current = "";
      lastCallAtRef.current = 0;
      run();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [normalized, terminalId, refreshNonce]);

  return {
    predictedFuelTempF,
    confidence,
    loading,
    error,
    ambientNowF: ambientResolvedF,
    unbiasedPredictionF,
    refresh,
  };
}
