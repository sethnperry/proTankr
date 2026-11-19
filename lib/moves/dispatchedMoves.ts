// lib/moves/dispatchedMoves.ts
//
// Moves that are planned, not begun: a bobtail move, an empty move, a trailer hook or a trailer drop, lined up by
// dispatch (or by a driver planning the day) and run one after another from the Driver Dashboard. Pure.

import type { EmptyMoveRow } from "../trips/types.ts";
import type { MovePlace } from "./emptyMoves.ts";

export type StepKind = "bobtail" | "empty" | "hook" | "drop";
export const STEP_KINDS: { id: StepKind; label: string; hint: string }[] = [
  { id: "bobtail", label: "Bobtail", hint: "Truck alone, from one place to the next." },
  { id: "empty", label: "Empty move", hint: "Truck with an empty trailer, to a place." },
  { id: "hook", label: "Hook trailer", hint: "Couple to a trailer at a place." },
  { id: "drop", label: "Drop trailer", hint: "Leave the trailer at a place." },
];
/** The stored kind for a step. An empty move rides on the existing "empty_return" kind. */
export const storedKind = (k: StepKind): EmptyMoveRow["kind"] => (k === "empty" ? "empty_return" : k);
export const stepKindOf = (m: Pick<EmptyMoveRow, "kind">): StepKind =>
  m.kind === "hook" ? "hook" : m.kind === "drop" ? "drop" : m.kind === "bobtail" ? "bobtail" : "empty";
export const stepLabel = (k: StepKind) => STEP_KINDS.find((s) => s.id === k)?.label ?? "Move";
/** Hook and drop take no time of their own: confirm and they are done. */
export const isInstant = (k: StepKind) => k === "hook" || k === "drop";

/** A driver's planned moves, in the order they will run. */
export function dispatchedMovesFor(moves: EmptyMoveRow[], userId: string): EmptyMoveRow[] {
  return moves
    .filter((m) => m.driver_id === userId && m.dispatched === true && !m.ended_at)
    .sort((a, b) => (a.dispatch_seq ?? 0) - (b.dispatch_seq ?? 0) || String(a.planned_start_at ?? "").localeCompare(String(b.planned_start_at ?? "")));
}

export function newDispatchedMove(o: {
  id: string; companyId: string; driverId: string; dispatcherId: string; kind: StepKind; seq: number; nowIso: string;
  truckId: string | null; trailerId: string | null; from: MovePlace; to: MovePlace; plannedStartIso: string | null; note: string | null;
}): Record<string, unknown> {
  return {
    move_id: o.id, company_id: o.companyId, driver_id: o.driverId, truck_id: o.truckId, trailer_id: o.trailerId, kind: storedKind(o.kind),
    from_place_id: o.from.id, from_text: o.from.text?.trim() || null, to_place_id: o.to.id, to_text: o.to.text?.trim() || null,
    started_at: o.nowIso, ended_at: null, begin_miles: null, end_miles: null, billable: null, notes: null, source: "app",
    dispatched: true, dispatched_by: o.dispatcherId, dispatch_seq: o.seq, planned_start_at: o.plannedStartIso, planned_note: o.note?.trim() || null,
    client_updated_at: o.nowIso,
  };
}

/** What the card says: "Bobtail to Yard 2", "Hook trailer 3151 at Yard 2", "Drop trailer at Love's 495". */
export function stepText(m: EmptyMoveRow, names: { place: (id: string | null, text: string | null) => string; trailer: (id: string | null) => string | null }): string {
  const k = stepKindOf(m);
  const to = names.place(m.to_place_id, m.to_text), from = names.place(m.from_place_id, m.from_text);
  const tr = names.trailer(m.trailer_id);
  if (k === "hook") return `Hook trailer${tr ? ` ${tr}` : ""} at ${to !== "—" ? to : from}`;
  if (k === "drop") return `Drop trailer${tr ? ` ${tr}` : ""} at ${to !== "—" ? to : from}`;
  return `${stepLabel(k)}${to !== "—" ? ` to ${to}` : ""}`;
}

/** The patch that begins a planned move. Hook and drop are also ended at once. */
export function beginPatch(m: Pick<EmptyMoveRow, "move_id" | "kind">, o: { atIso: string; truckId: string | null; trailerId: string | null; beginMiles: number | null }): Record<string, unknown> {
  const instant = isInstant(stepKindOf(m));
  return {
    move_id: m.move_id, dispatched: false, started_at: o.atIso, begin_miles: o.beginMiles,
    truck_id: o.truckId, trailer_id: m.kind === "hook" || m.kind === "drop" ? o.trailerId : o.trailerId,
    ...(instant ? { ended_at: o.atIso, end_miles: o.beginMiles } : {}),
  };
}
