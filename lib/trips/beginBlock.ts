// lib/trips/beginBlock.ts
//
// Begin Loading from the dashboard couldn't start. Instead of sending the driver to the Planner, the dashboard says
// why. First matching reason wins. Pure.

export type BeginBlockState = {
  tripNeedsArrive: boolean; presetsReady: boolean; hasCombo: boolean; hasTerminal: boolean;
  plannedProducts: number; terminalProducts: number; unavailableComps: number;
};
export type BeginBlock = { title: string; text: string };

export function beginBlockMessage(s: BeginBlockState): BeginBlock {
  if (s.tripNeedsArrive) return { title: "Arrive first", text: "Tap Arrive at the pickup before you begin loading." };
  if (!s.hasCombo) return { title: "Pick your equipment", text: "Select your truck and trailer before you begin loading." };
  if (!s.hasTerminal) return { title: "Terminal not set", text: "The pickup terminal isn't set. Tap Another rack or check the pickup, then try again." };
  if (!s.presetsReady) return { title: "Plans still loading", text: "Your plans haven't finished loading. Wait a moment and tap Begin Loading again." };
  if (s.plannedProducts === 0) return { title: "No plan selected", text: "There is no plan for this load. Pick a plan from the Planner tile, then tap Begin Loading." };
  if (s.terminalProducts === 0 || s.unavailableComps > 0) return { title: "No products match the plan", text: "No products match the selected plan. Please verify the terminal products." };
  return { title: "Couldn't start loading", text: "Loading couldn't start. Wait a moment and tap Begin Loading again. If it keeps happening, tell dispatch." };
}
