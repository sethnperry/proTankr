"use client";
// app/planner/hooks/usePlanTemperature.ts
//
// The product temperature the plan starts from: the city's predicted fuel
// temperature is applied to the dial when it arrives (and again when a fresher
// one does), unless the driver has moved the dial themselves. Lifted out of
// PlannerHost unchanged.

import { useEffect, useRef } from "react";
import { useFuelTempPrediction } from "./useFuelTempPrediction";
import { recordLocationForSwitchTracking } from "../utils/locationSwitchProgress";

import type { useCalculatorShell } from "../CalculatorShellContext";

type Inputs = {
  location: ReturnType<typeof useCalculatorShell>["location"];
  effectiveUserId: string | null | undefined;
  tempF: number;
  setTempF: (v: number | ((prev: number) => number)) => void;
};

export function usePlanTemperature(i: Inputs) {
  const { location, effectiveUserId, tempF, setTempF } = i;
  // Fuel temp prediction — drives temp button border color and pre-fills ProductTempModal.
  //
  // City/state only -- the server resolves its own fresh ambient + city-level
  // coordinates (see /api/fuel-temp), never trusting a client-supplied value.
  // terminalId is passed through only for the per-terminal bias lookup. The
  // modal below shows this hook's own resolved ambientNowF, not a separately
  // polled value, so the displayed label and the predicted temp can never
  // drift apart (see fuelTempPredictor.ts / route.ts for the fuller history
  // of why this matters -- an earlier version of this app tracked ambient
  // per-terminal and once had 3 terminals silently resolving to (0,0)).
  const {
    predictedFuelTempF, confidence: fuelTempConfidence, loading: fuelTempLoading,
    ambientNowF: fuelTempAmbientF,
    unbiasedPredictionF: fuelTempUnbiasedF,
    refresh: refreshFuelTemp,
  } = useFuelTempPrediction({
    city: location.selectedCity || null,
    state: location.selectedState || null,
    terminalId: location.selectedTerminalId || null,
  });

  // Auto-apply prediction to the slider when it first arrives.
  // userAdjustedTempRef = true means the driver has manually moved the slider.
  // Resets whenever city/state changes so a new terminal gets a fresh auto-apply.
  const predAppliedForRef = useRef<string>("");
  const userAdjustedTempRef = useRef<boolean>(false);

  // Mark as user-adjusted whenever tempF changes AFTER a prediction has been
  // applied. Real bug fixed here: this used to check only whether
  // predAppliedForRef was non-empty -- but the auto-apply effect below sets
  // that ref in the SAME tick it calls setTempF, so this effect's own next
  // run (triggered by that very auto-apply) always saw a non-empty ref and
  // incorrectly marked the auto-apply's own change as a manual edit. That
  // permanently blocked ANY future re-application of a fresh prediction for
  // that city/state -- confirmed live, this is why the modal could show a
  // newer number than the button/load payload ever received. Now compares
  // the new value against the prediction itself: only a change that doesn't
  // match the last-known prediction counts as a genuine manual edit.
  const prevTempFRef = useRef<number>(tempF);
  useEffect(() => {
    if (Math.abs(tempF - prevTempFRef.current) > 0.1) {
      const matchesPrediction = predictedFuelTempF != null && Math.abs(tempF - predictedFuelTempF) < 0.1;
      if (predAppliedForRef.current !== "" && !matchesPrediction) {
        userAdjustedTempRef.current = true;
      }
    }
    prevTempFRef.current = tempF;
  }, [tempF, predictedFuelTempF]);

  // Reset on city/state change
  useEffect(() => {
    predAppliedForRef.current = "";
    userAdjustedTempRef.current = false;
    prevTempFRef.current = tempF;
  }, [location.selectedCity, location.selectedState]);

  // Setup Guide checklist's "switch to a terminal in a different city"
  // sub-task -- see utils/locationSwitchProgress.ts's own header comment
  // for why this is a write-once flag, not derived fresh from live state
  // the way the rest of the checklist is.
  useEffect(() => {
    recordLocationForSwitchTracking(effectiveUserId, location.selectedState, location.selectedCity);
  }, [effectiveUserId, location.selectedState, location.selectedCity]);

  // Apply prediction to slider when it arrives -- skip if the driver has
  // genuinely adjusted it since. Previously this stopped re-applying the
  // instant predAppliedForRef matched the current city/state key, even if
  // a LATER fetch (e.g. the periodic refresh in useFuelTempPrediction.ts)
  // returned a materially different number -- meaning a driver who left
  // the app open all day could keep seeing a temp from hours earlier even
  // though the modal's own banner (which reads predictedFuelTempF
  // directly, bypassing this effect) had already moved on. Now re-checks
  // the actual value each time, so any later fetch with a real delta still
  // lands on the button/load payload, not just the modal.
  useEffect(() => {
    if (predictedFuelTempF == null) return;
    if (userAdjustedTempRef.current) return;
    if (Math.abs(tempF - predictedFuelTempF) < 0.1) return;
    setTempF(predictedFuelTempF);
    predAppliedForRef.current = `${location.selectedCity}|${location.selectedState}`;
  }, [predictedFuelTempF, location.selectedCity, location.selectedState, tempF]);

  return { predictedFuelTempF, fuelTempConfidence, fuelTempLoading, fuelTempAmbientF, fuelTempUnbiasedF, refreshFuelTemp, userAdjustedTempRef };
}
