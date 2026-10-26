"use client";
// app/planner/modals/decouple/ScenarioStep.tsx
//
// Decouple dialog step.


import { ScenarioCard } from "./ScenarioCard";
import type { DecoupleModel } from "./useDecouple";

export function ScenarioStep({ m }: { m: DecoupleModel }) {
  const { truckName, trailerName, pickScenario } = m;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.50)", marginBottom: 4, lineHeight: 1.55 }}>
        In order to decouple{" "}
        <strong style={{ color: "rgba(255,255,255,0.85)" }}>{truckName} / {trailerName}</strong>,
        please choose an action and update the status.
      </div>
      <ScenarioCard emoji="🔄" title="Swap the truck"
        sub="Switching to a different power unit. Keeping the same trailer to couple with a new truck at this location."
        onClick={() => pickScenario("swap_truck")} />
      <ScenarioCard emoji="🔁" title="Swap the trailer"
        sub="Switching to a different trailer. Keeping the same power unit to couple with a new trailer at this location."
        onClick={() => pickScenario("swap_trailer")} />
      <ScenarioCard emoji="🔓" title="Drop the trailer"
        sub="I'm bobtailing away. The trailer stays at this location."
        onClick={() => pickScenario("drop_trailer")} />
      <ScenarioCard emoji="🅿️" title="Park both units"
        sub="Drop the trailer, park the truck and take the Nike express."
        onClick={() => pickScenario("park_both")} />
    </div>
  );
}
