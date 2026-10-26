"use client";
// app/planner/modals/loading/FinishOverlays.tsx
//
// Windows opened from Plan Review: cap entry, then the Finish Loading windows.

import ValueEntryOverlay from "../../components/ValueEntryOverlay";
import { ProductEntryOverlay } from "./ProductEntryOverlay";
import { SplitLoadOverlay } from "./SplitLoadOverlay";
import { TripStepOverlays } from "./TripStepOverlays";
import type { LoadingModel } from "./useLoadingModel";

export function FinishOverlays({ m }: { m: LoadingModel }) {
  const { commitGallonsOverlay, gallonsCap, gallonsInput, gallonsTarget, setGallonsInput, setGallonsTarget } = m;
  return (
    <>
      {/* Compartment cap tap-to-adjust -- sets the max gallons for this comp
          (weight-bounded solver, can't overload); recovers from a mistype.
          Review mode only -- report mode's compartments aren't tappable. */}
      <ValueEntryOverlay
        open={gallonsTarget != null}
        title={gallonsTarget ? `Cap · C${gallonsTarget.comp}` : "Cap"}
        fields={[{ key: "gallons", label: "Max gallons", value: gallonsInput, onChange: setGallonsInput, suffix: "gal" }]}
        hint={gallonsCap != null ? `Up to ${Math.round(gallonsCap)} gal` : undefined}
        onCancel={() => setGallonsTarget(null)}
        onSubmit={commitGallonsOverlay}
      />

      <ProductEntryOverlay m={m} />
      <SplitLoadOverlay m={m} />
      <TripStepOverlays m={m} />
    </>
  );
}
