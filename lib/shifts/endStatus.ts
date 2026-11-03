// lib/shifts/endStatus.ts
//
// The question at End shift: what status should the truck get? Asked only when nobody set the truck's status during
// the shift (a stud made in the equipment modal is respected, silently). Sleeper trucks can stay In use; a truck with
// product aboard offers Park preloaded instead of Readyline. Pure: no Supabase, no React.

export type EndStatusChoice = "in_use" | "deadline" | "readyline" | "park_preloaded";
export type EndStatusOption = { value: EndStatusChoice; label: string; hint: string };

const HINT: Record<EndStatusChoice, string> = {
  in_use: "Staying with the truck (sleeper).",
  deadline: "Needs work. Not available.",
  readyline: "Ready for the next driver.",
  park_preloaded: "Loaded trailer waiting for the next driver or you.",
};
const LABEL: Record<EndStatusChoice, string> = { in_use: "In use", deadline: "Deadline", readyline: "Readyline", park_preloaded: "Park preloaded" };

export function endStatusOptions(o: { sleeper: boolean; loaded: boolean }): EndStatusOption[] {
  const order: EndStatusChoice[] = [...(o.sleeper ? (["in_use"] as const) : []), "deadline", o.loaded ? "park_preloaded" : "readyline"];
  // In use first for a sleeper, then Deadline, then Readyline or Park preloaded.
  return order.map((value) => ({ value, label: LABEL[value], hint: HINT[value] }));
}

/** The truck's status was set after this shift began (in the equipment modal or elsewhere): leave it alone. */
export function statusSetThisShift(statusUpdatedAt: string | null | undefined, shiftStartedAt: string | null | undefined): boolean {
  const s = statusUpdatedAt ? Date.parse(statusUpdatedAt) : NaN;
  const b = shiftStartedAt ? Date.parse(shiftStartedAt) : NaN;
  return Number.isFinite(s) && Number.isFinite(b) && s >= b;
}
