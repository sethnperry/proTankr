"use client";
// app/planner/flows/StaleApiFlow.tsx
//
// The choice shown when a planned product's last API reading is old. A container: reads the planner model with usePlanner() and hands the
// window what it shows. Mount it anywhere under PlannerProvider.

import StaleApiOverlay from "../components/StaleApiOverlay";
import { usePlanner } from "../PlannerContext";

export default function StaleApiFlow() {
  const { staleApiPrompt, setStaleApiPrompt, handleStaleSafest, handleStaleSafe, handleStaleIgnore } = usePlanner();

  return (
        <StaleApiOverlay
          open={!!staleApiPrompt}
          products={staleApiPrompt?.products ?? []}
          onSafest={handleStaleSafest}
          onSafe={handleStaleSafe}
          onIgnore={handleStaleIgnore}
          onCancel={() => setStaleApiPrompt(null)}
        />
  );
}
