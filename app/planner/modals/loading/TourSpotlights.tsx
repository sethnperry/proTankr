"use client";
// app/planner/modals/loading/TourSpotlights.tsx
//
// First-open walkthrough spotlights.

import Spotlight from "../../components/TourSpotlight";
import type { LoadingModel } from "./useLoadingModel";

export function TourSpotlights({ m }: { m: LoadingModel }) {
  const { logLoadButtonRect, plannedBlockRect, setTourStep } = m;
  return (
    <>
      {/* First-open walkthrough -- see the tourStep effect above. Both
          Spotlight calls are unconditional; each one's own rect is already
          null whenever its step isn't active (useSpotlightRect), so it
          renders nothing on its own. */}
      <Spotlight
        rect={plannedBlockRect}
        title="Load This"
        body="This is what you're about to load — tap a compartment's gallons to adjust it if you need to."
        actionLabel="Next →"
        onAction={() => setTourStep(1)}
      />
      <Spotlight
        rect={logLoadButtonRect}
        title="Finish Loading"
        body="When you're done loading, tap here."
        actionLabel="Got it"
        onAction={() => setTourStep(null)}
      />
    </>
  );
}
