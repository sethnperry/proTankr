"use client";
// app/planner/components/onboarding/useOnboardingActions.ts
//
// Part of SoloOnboarding.tsx: the writes behind each step.

import { useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { isTutorialSeen, markTutorialSeen, markOnboardingComplete, writeTrailerDraft, clearTrailerDraft } from "../../utils/onboardingProgress";
import { MAX_PLAUSIBLE_CAP_GAL, MAX_PLAUSIBLE_TARE_LBS, SAFETY_BUFFER_GAL } from "./helpers";
import type { OnboardingState } from "./types";

export function useOnboardingActions(s: OnboardingState) {
  const { userId, companyId, fetchCombos, setSelectedComboId, setCurrentEquipment, onComplete, setStep, setBusy, setError, setSkippedTrailer, name, company, truckNumber, trailerNumber, compCount, caps, setCaps, capIdx, setCapIdx, capInput, setCapInput, tareInput, tareLbs, setTareLbs, targetInput, truckIdRef, trailerIdRef, builtRef, locationSet, terminalSet } = s;
  // ── Writes ──

  const saveIdentity = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Please enter your name."); return; }
    setBusy(true); setError(null);
    // Name is required — a failure here is a hard stop.
    try {
      const { error: e1 } = await supabase.rpc("upsert_driver_profile", {
        p_user_id: userId, p_company_id: companyId, p_data: { display_name: trimmed },
      });
      if (e1) throw e1;
    } catch (e: any) {
      console.error("[onboarding] name save failed:", e?.code, e?.message ?? e);
      setError("Couldn't save your name. Check your connection and try again.");
      setBusy(false);
      return;
    }
    // Company is optional — a rename failure (e.g. this driver doesn't own the
    // company, or a transient error) must NEVER strand them on this step: the
    // required name already saved. Best-effort, advance regardless.
    const co = company.trim();
    if (co) {
      try {
        const { error: e2 } = await supabase.rpc("set_solo_company_name", { p_company_id: companyId, p_name: co });
        if (e2) throw e2;
      } catch (e: any) {
        console.warn("[onboarding] company rename skipped:", e?.code, e?.message ?? e);
      }
    }
    builtRef.current = true;
    setStep("truck");
    setBusy(false);
  }, [name, company, userId, companyId]);

  const saveTruck = useCallback(async () => {
    const num = truckNumber.trim();
    if (!num) { setError("Enter your truck number."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from("trucks")
        .insert({ truck_name: num, active: true, company_id: companyId })
        .select("truck_id").single();
      if (e) throw e;
      truckIdRef.current = String((data as any).truck_id);
      builtRef.current = true;
      setStep("trailer");
    } catch (e: any) {
      // truck_name is unique per company (trucks_company_truck_name_key,
      // see 20260925000000_scope_unit_names_per_company.sql -- it used to
      // be globally unique across every company in the app, a real bug
      // fixed there); a duplicate here means this exact number is already
      // used elsewhere in THIS company.
      setError(e?.code === "23505"
        ? "That truck number is already in use in this company. Enter a different one."
        : "Couldn't save the truck. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [truckNumber, companyId]);

  const startTrailer = useCallback(() => {
    const num = trailerNumber.trim();
    if (!num) { setError("Enter your trailer number."); return; }
    if (!(compCount >= 1 && compCount <= 12)) { setError("Choose how many compartments the trailer has."); return; }
    setError(null);
    const nextCaps = Array.from({ length: compCount }, (_, i) => caps[i]);
    setCaps(nextCaps);
    setCapIdx(0);
    setCapInput(nextCaps[0] != null ? String(nextCaps[0]) : "");
    writeTrailerDraft(userId, { trailerNumber: num, compCount, caps: nextCaps });
    builtRef.current = true;
    setStep("caps");
  }, [trailerNumber, compCount, caps, userId]);

  // Phase 2 — skip the trailer entirely and run bobtail. Persists the truck
  // as the driver's current held unit (truck-only), then advances to
  // location/terminal if unset, or completes. The truck was already created
  // on the truck step, so truckIdRef.current is populated here.
  const skipTrailerBobtail = useCallback(async () => {
    const truckId = truckIdRef.current;
    if (!truckId) { setError("Add your truck first."); return; }
    if (!setCurrentEquipment) { setError("Can't skip right now — please add a trailer."); return; }
    setBusy(true); setError(null);
    try {
      await setCurrentEquipment(truckId, null);
      clearTrailerDraft(userId);
      setSkippedTrailer(true);
      if (!locationSet) { setStep("location"); }
      else if (!terminalSet) { setStep("terminal"); }
      else { markOnboardingComplete(userId); onComplete(); }
    } catch (e: any) {
      setError("Couldn't skip the trailer. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [setCurrentEquipment, userId, locationSet, terminalSet, onComplete]);

  const saveCap = useCallback(() => {
    const val = Number(capInput);
    if (!Number.isFinite(val) || val <= 0) { setError("Enter a capacity in gallons."); return; }
    if (val > MAX_PLAUSIBLE_CAP_GAL) { setError("That capacity looks unusually high. Check the number and try again."); return; }
    setError(null);
    const nextCaps = caps.slice();
    nextCaps[capIdx] = val;
    setCaps(nextCaps);
    writeTrailerDraft(userId, { trailerNumber: trailerNumber.trim(), compCount, caps: nextCaps });
    if (capIdx + 1 < compCount) {
      setCapIdx(capIdx + 1);
      setCapInput(nextCaps[capIdx + 1] != null ? String(nextCaps[capIdx + 1]) : "");
    } else {
      setStep("safety");
    }
  }, [capInput, caps, capIdx, compCount, trailerNumber, userId]);

  const safetyCapFor = useCallback((cap: number) => (cap > SAFETY_BUFFER_GAL ? cap - SAFETY_BUFFER_GAL : Math.max(1, cap)), []);

  const commitTrailer = useCallback(async () => {
    const num = trailerNumber.trim();
    const filled = caps.map((c) => Number(c)).filter((c) => Number.isFinite(c) && c > 0);
    if (filled.length !== compCount) { setError("Please enter every compartment capacity."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase
        .from("trailers")
        .insert({ trailer_name: num, active: true, company_id: companyId })
        .select("trailer_id").single();
      if (e) throw e;
      const trailerId = String((data as any).trailer_id);
      trailerIdRef.current = trailerId;

      const rows = caps.map((c, i) => {
        const total = Number(c);
        return {
          trailer_id: trailerId,
          comp_number: i + 1,
          max_gallons: total,
          position: i,
          cap_gallons: safetyCapFor(total),
        };
      });
      const { error: ce } = await supabase.from("trailer_compartments").insert(rows);
      if (ce) throw ce;

      clearTrailerDraft(userId);
      setStep("tare");
    } catch (e: any) {
      // trailer_name is unique per company, not globally -- see the
      // saveTruck() comment above / 20260925000000_scope_unit_names_per_
      // company.sql.
      setError(e?.code === "23505"
        ? "That trailer number is already in use in this company. Enter a different one."
        : "Couldn't save the trailer. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [trailerNumber, caps, compCount, companyId, userId, safetyCapFor]);

  const saveTare = useCallback(() => {
    const val = Number(tareInput);
    if (!Number.isFinite(val) || val <= 0) { setError("Enter the combined tare weight (lbs)."); return; }
    if (val > MAX_PLAUSIBLE_TARE_LBS) { setError("That tare looks unusually high. Check the number and try again."); return; }
    setError(null);
    setTareLbs(val);
    setStep("target");
  }, [tareInput]);

  const coupleAndContinue = useCallback(async () => {
    const target = Number(targetInput);
    if (!Number.isFinite(target) || target <= 0) { setError("Enter a target weight (lbs)."); return; }
    const truckId = truckIdRef.current;
    const trailerId = trailerIdRef.current;
    if (!truckId || !trailerId || tareLbs == null) { setError("Something's missing. Go back and re-enter your equipment."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase.rpc("couple_combo", {
        p_truck_id: truckId,
        p_trailer_id: trailerId,
        p_tare_lbs: tareLbs,
        p_target_weight: target,
        p_force: true,
      });
      if (e) throw e;
      const comboId = String((data as any)?.combo_id ?? "");
      if (!comboId) throw new Error("No combo returned.");
      await fetchCombos();
      setSelectedComboId(comboId);
      setStep(locationSet ? (terminalSet ? "ready" : "terminal") : "location");
    } catch (e: any) {
      // Surface the real reason instead of a one-size-fits-all message --
      // this step previously swallowed every possible failure (a genuine
      // network error, an RLS/authorization issue, a stale RPC signature
      // after an unapplied migration, etc.) behind the same generic text,
      // which made a real first-production-run failure undiagnosable from
      // the screen alone.
      setError(e?.message ? `Couldn't pair your equipment: ${e.message}` : "Couldn't pair your equipment. Check your connection and try again.");
    } finally { setBusy(false); }
  }, [targetInput, tareLbs, fetchCombos, setSelectedComboId, locationSet, terminalSet]);

  const finishTutorial = useCallback(() => {
    markTutorialSeen(userId);
    setStep("done");
  }, [userId]);

  const finishAll = useCallback(() => {
    markOnboardingComplete(userId);
    onComplete();
  }, [userId, onComplete]);

  // When we arrive at "ready", decide whether the tutorial is still needed.
  const goFromReady = useCallback(() => {
    if (isTutorialSeen(userId)) { finishAll(); return; }
    setStep("tutorial");
  }, [userId, finishAll]);
  return { saveIdentity, saveTruck, startTrailer, skipTrailerBobtail, saveCap, safetyCapFor, commitTrailer, saveTare, coupleAndContinue, finishTutorial, finishAll, goFromReady };
}
