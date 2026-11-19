import test from "node:test";
import assert from "node:assert/strict";
import { beginPatch, dispatchedMovesFor, isInstant, newDispatchedMove, stepKindOf, stepText, storedKind } from "./dispatchedMoves.ts";
import type { EmptyMoveRow } from "../trips/types.ts";

const mk = (over: Partial<EmptyMoveRow>): EmptyMoveRow => ({ ...(newDispatchedMove({ id: "m", companyId: "c", driverId: "d", dispatcherId: "x", kind: "bobtail", seq: 1, nowIso: "2026-11-19T00:00:00Z", truckId: "t", trailerId: null, from: { id: null, text: "Yard 1" }, to: { id: null, text: "Yard 2" }, plannedStartIso: null, note: null }) as unknown as EmptyMoveRow), ...over });
const names = { place: (id: string | null, t: string | null) => t || "—", trailer: (id: string | null) => (id ? "3151" : null) };

test("planned moves run in sequence, only for the driver, and only while waiting", () => {
  const rows = [mk({ move_id: "b", dispatch_seq: 2 }), mk({ move_id: "a", dispatch_seq: 1 }), mk({ move_id: "other", driver_id: "z" }), mk({ move_id: "begun", dispatched: false }), mk({ move_id: "done", ended_at: "2026-11-19T01:00:00Z" })];
  assert.deepEqual(dispatchedMovesFor(rows, "d").map((m) => m.move_id), ["a", "b"]);
});
test("an empty move is stored as the existing empty_return kind and reads back as empty", () => {
  assert.equal(storedKind("empty"), "empty_return");
  assert.equal(stepKindOf({ kind: "empty_return" }), "empty");
  assert.equal(stepKindOf({ kind: "reposition" }), "empty");
});
test("the card text names the kind, trailer and place", () => {
  assert.equal(stepText(mk({}), names), "Bobtail to Yard 2");
  assert.equal(stepText(mk({ kind: "hook", trailer_id: "tr", to_text: "Yard 2" }), names), "Hook trailer 3151 at Yard 2");
  assert.equal(stepText(mk({ kind: "drop", trailer_id: "tr", to_text: null, from_text: "Love's 495" }), names), "Drop trailer 3151 at Love's 495");
});
test("beginning a move stamps the start; hook and drop also end at once", () => {
  const o = { atIso: "2026-11-19T05:00:00Z", truckId: "t", trailerId: "tr", beginMiles: 100 };
  assert.equal(beginPatch(mk({}), o).ended_at, undefined);
  assert.equal(beginPatch(mk({ kind: "hook" }), o).ended_at, o.atIso);
  assert.equal(isInstant("drop"), true);
});
