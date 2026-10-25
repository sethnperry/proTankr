"use client";
// app/planner/hooks/usePlanInputs.ts
//
// The plan's temperature and CG inputs: the dial's reference temperature, each
// product's own temperature, and the CG slider. Lifted out of PlannerHost
// unchanged. Only the dial temperature and CG are saved on the phone; the
// per-product temperatures are always re-seeded from the live prediction.

import { useCallback, useEffect, useRef, useState } from "react";

export function usePlanInputs() {
  const [tempF, setTempFRaw] = useState<number>(60);

  // Per-product planned temp -- split load (e.g. diesel + regular in the same
  // trailer) genuinely have different temps (different tanks), so a single
  // shared tempF was wrong the moment more than one product was in the plan.
  // tempF is kept as the dial's own "reference" value; every existing way of
  // moving it (drag, type-in, quick +/-, snap buttons) now also shifts every
  // product's own temp by the same delta, applied once here so none of those
  // call sites needed to change. Setting one product directly (tapping its
  // row in the modal) bypasses this and only touches that product -- see
  // setSingleProductTempF below. Deliberately NOT persisted to localStorage
  // like tempF is -- same "always re-seeded from the live prediction, never
  // restored from a snapshot" rule tempF itself already follows.
  const [productTempF, setProductTempF] = useState<Record<string, number>>({});

  // Kept in sync synchronously (not via a useEffect) so setTempF can always
  // read "prev" without nesting a second setState call inside setTempFRaw's
  // own updater. That nested-call version worked in production but silently
  // double-applied the delta in dev: React 18 StrictMode double-invokes
  // updater functions to catch impure ones, and an updater that calls
  // setProductTempF as a side effect isn't pure -- both invocations actually
  // fired the nested update, doubling the shift. Caught this live testing
  // the split-load dial (a single +5.8° drag was landing as +11.6°).
  const tempFRef = useRef(60);

  const setTempF = useCallback((v: number | ((prev: number) => number)) => {
    const prev = tempFRef.current;
    const next = typeof v === "function" ? v(prev) : v;
    const delta = Math.round((next - prev) * 10) / 10;
    tempFRef.current = next;
    if (delta !== 0) {
      setProductTempF((prevProd) => {
        if (Object.keys(prevProd).length === 0) return prevProd;
        const out: Record<string, number> = {};
        for (const [pid, val] of Object.entries(prevProd)) out[pid] = Math.round((val + delta) * 10) / 10;
        return out;
      });
    }
    try { localStorage.setItem("protankr_tempF_v1", String(next)); } catch {}
    setTempFRaw(next);
  }, []);

  // Safety net for the one path that sets tempF directly (localStorage
  // hydration on mount, below) instead of through setTempF -- keeps the ref
  // truthful even then, so a delta computed right after mount is never based
  // on the stale initial 60 default.
  useEffect(() => { tempFRef.current = tempF; }, [tempF]);

  const setSingleProductTempF = useCallback((productId: string, value: number) => {
    setProductTempF((prev) => ({ ...prev, [productId]: Math.round(value * 10) / 10 }));
  }, []);

  const [cgSlider, setCgSliderRaw] = useState<number>(0.5);
  const setCgSlider = useCallback((v: number | ((prev: number) => number)) => {
    setCgSliderRaw(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try { localStorage.setItem("protankr_cgSlider_v1", String(next)); } catch {}
      return next;
    });
  }, []);

  // Hydrate tempF and cgSlider once on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("protankr_tempF_v1");
      if (t != null && Number.isFinite(Number(t))) setTempFRaw(Number(t));
      const cg = localStorage.getItem("protankr_cgSlider_v1");
      if (cg != null && Number.isFinite(Number(cg))) setCgSliderRaw(Number(cg));
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { tempF, setTempF, tempFRef, productTempF, setProductTempF, setSingleProductTempF, cgSlider, setCgSlider };
}
