"use client";
// app/planner/utils/openAccessSteps.ts
//
// Event bridge so any hook or component can open the access-steps sheet.

// Open the steps sheet from anywhere under the planner layout. The host in
// CalculatorLayoutClient listens for this.
export type OpenAccessStepsDetail = {
  terminalId: string;
  // Set when a load is starting: the host starts the sequence automatically
  // if the driver has no access here, and shows the steps if one is underway.
  fromLoad?: { prevCardedOn: string | null };
};
export const OPEN_ACCESS_STEPS_EVENT = "protankr:open-access-steps";
export function openAccessSteps(detail: OpenAccessStepsDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenAccessStepsDetail>(OPEN_ACCESS_STEPS_EVENT, { detail }));
}
