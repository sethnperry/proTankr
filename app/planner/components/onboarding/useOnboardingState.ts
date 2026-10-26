"use client";
// app/planner/components/onboarding/useOnboardingState.ts
//
// Part of SoloOnboarding.tsx: form state, resolved ids, and the effects that pick the starting step.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { markOnboardingComplete, readTrailerDraft } from "../../utils/onboardingProgress";
import type { Step, SoloOnboardingProps } from "./types";
import { DEFAULT_TARGET_LBS } from "./helpers";

export function useOnboardingState(props: SoloOnboardingProps) {
  const {
    userId, companyId,
    selectedState, selectedCity, selectedTerminalId,
    onOpenLocation, onOpenTerminal,
    fetchCombos, setSelectedComboId, setCurrentEquipment, onComplete,
  } = props;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [step, setStep] = useState<Step>("resolving");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 2 — set when the driver skips the trailer step (bobtail). A bobtail
  // driver has no compartments, so the plan-setup tutorial doesn't apply:
  // once location/terminal are set they go straight to complete, skipping
  // ready/tutorial.
  const [skippedTrailer, setSkippedTrailer] = useState(false);

  // ── Form state ──
  const [name, setName] = useState(props.displayName ?? "");
  const [company, setCompany] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [compCount, setCompCount] = useState<number>(3);
  const [caps, setCaps] = useState<(number | undefined)[]>([]);
  const [capIdx, setCapIdx] = useState(0);
  const [capInput, setCapInput] = useState("");
  const [tareInput, setTareInput] = useState("");
  const [tareLbs, setTareLbs] = useState<number | null>(null);
  const [targetInput, setTargetInput] = useState(String(DEFAULT_TARGET_LBS));

  // ── Resolved equipment ids (created here, or loaded on resume) ──
  const truckIdRef = useRef<string | null>(null);
  const trailerIdRef = useRef<string | null>(null);
  // True once we've actually built anything this session -- gates whether the
  // tutorial shows. An already-fully-set-up solo user (e.g. the existing
  // operator/demo company) is silently marked complete with no UI.
  const builtRef = useRef(false);

  const locationSet = Boolean(selectedState && selectedCity);
  const terminalSet = Boolean(selectedTerminalId);

  // ── Resolve the starting step from real DB state (resume-safe) ──
  useEffect(() => {
    let cancelled = false;
    if (!userId || !companyId) return;
    (async () => {
      try {
        const [{ data: prof }, { data: truckRows }, { data: trailerRows }, { data: comboRows }] = await Promise.all([
          supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle(),
          supabase.from("trucks").select("truck_id, truck_name").eq("company_id", companyId).eq("active", true).order("truck_name"),
          supabase.from("trailers").select("trailer_id, trailer_name").eq("company_id", companyId).eq("active", true).order("trailer_name"),
          supabase.from("equipment_combos").select("combo_id, tare_lbs, truck_id, trailer_id").eq("company_id", companyId).eq("active", true),
        ]);
        if (cancelled) return;

        const nameDone = Boolean(prof?.display_name && String(prof.display_name).trim());
        if (prof?.display_name) setName(String(prof.display_name));

        const firstTruck = (truckRows ?? [])[0] as { truck_id: string } | undefined;
        const firstTrailer = (trailerRows ?? [])[0] as { trailer_id: string } | undefined;
        truckIdRef.current = firstTruck?.truck_id ?? null;
        trailerIdRef.current = firstTrailer?.trailer_id ?? null;

        const truckExists = Boolean(firstTruck);
        const trailerExists = Boolean(firstTrailer);
        const comboReady = (comboRows ?? []).some((c: any) => Number(c?.tare_lbs ?? 0) > 0);

        // Already-onboarded (existing solo user): everything the planner needs
        // exists AND they have a name. Silently complete, no UI, no tutorial.
        if (nameDone && comboReady && locationSet && terminalSet) {
          markOnboardingComplete(userId);
          onComplete();
          return;
        }

        // A prior in-progress trailer draft (compartments not yet committed)?
        const draft = !trailerExists ? readTrailerDraft(userId) : null;

        // First incomplete step, in order.
        let start: Step;
        if (!nameDone && !truckExists && !trailerExists && !comboReady) {
          start = "welcome"; // truly fresh
        } else if (!nameDone) {
          start = "identity";
        } else if (!truckExists) {
          start = "truck";
        } else if (!trailerExists) {
          if (draft) {
            setTrailerNumber(draft.trailerNumber);
            setCompCount(draft.compCount);
            setCaps(draft.caps);
            const nextIdx = draft.caps.findIndex((c) => c == null);
            if (nextIdx === -1) { start = "safety"; setCapIdx(draft.compCount); }
            else { start = "caps"; setCapIdx(nextIdx); }
            builtRef.current = true;
          } else {
            start = "trailer";
          }
        } else if (!comboReady) {
          start = "tare";
        } else if (!locationSet) {
          start = "location";
        } else if (!terminalSet) {
          start = "terminal";
        } else {
          start = "tutorial"; // everything built this/last session; finish with tutorial
        }

        if (truckExists || trailerExists || comboReady) builtRef.current = true;
        setStep(start);
      } catch (e: any) {
        if (!cancelled) { setStep("welcome"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, companyId]);

  // ── Auto-advance the location/terminal steps as the shared pickers resolve ──
  useEffect(() => {
    if (step === "location" && locationSet) setStep("terminal");
  }, [step, locationSet]);
  useEffect(() => {
    if (step === "terminal" && terminalSet) {
      // Bobtail driver: no trailer -> no compartments -> the plan-setup
      // tutorial doesn't apply. Finish straight from terminal. (markComplete
      // + onComplete inlined here rather than referencing finishAll, which is
      // declared further down -- avoids a TDZ in this effect's dep array.)
      if (skippedTrailer) { markOnboardingComplete(userId); onComplete(); }
      else setStep("ready");
    }
  }, [step, terminalSet, skippedTrailer, userId, onComplete]);

  return {
    userId, companyId, selectedState, selectedCity, selectedTerminalId, onOpenLocation, onOpenTerminal, fetchCombos, setSelectedComboId, setCurrentEquipment, onComplete, mounted, step, setStep, busy, setBusy, error, setError, skippedTrailer, setSkippedTrailer, name, setName, company, setCompany, truckNumber, setTruckNumber, trailerNumber, setTrailerNumber, compCount, setCompCount, caps, setCaps, capIdx, setCapIdx, capInput, setCapInput, tareInput, setTareInput, tareLbs, setTareLbs, targetInput, setTargetInput, truckIdRef, trailerIdRef, builtRef, locationSet, terminalSet,
  };
}
