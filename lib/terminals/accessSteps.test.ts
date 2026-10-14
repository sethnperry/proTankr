import { test } from "node:test";
import assert from "node:assert/strict";
import { accessSteps, requirementsComplete, type AccessRequirements, type AccessProgress } from "./accessSteps.ts";

const req = (over: Partial<AccessRequirements> = {}): AccessRequirements => ({
  terminal_id: "t", training_loads_required: 3, has_training_media: true, training_media_url: null,
  new_user_url: "https://x", letter_required: true, letter_due: "before_check_load",
  has_orientation: true, orientation_schedule: "Mon-Fri 8-10", notes: null, ...over,
});
const prog = (over: Partial<AccessProgress> = {}): AccessProgress => ({
  id: "q", terminal_id: "t", started_at: "2026-10-14T00:00:00Z", letter_id: null, letter_attached_at: null,
  media_done_at: null, registered_at: null, orientation_done_at: null, loads_adjust: 0,
  card_issued_at: null, completed_at: null, ...over,
});

test("order puts the letter where the terminal needs it; check load is the last load", () => {
  const s = accessSteps(req(), prog(), 1);
  assert.deepEqual(s.map((x) => x.key), ["media", "register", "orientation", "load:1", "load:2", "letter", "load:3", "card"]);
  assert.deepEqual(s.map((x) => x.state), ["next", "pending", "pending", "done", "pending", "pending", "blocked", "pending"]);
  const up = accessSteps(req({ letter_due: "before_first_load" }), prog(), 0);
  assert.equal(up[0].key, "letter");
  const card = accessSteps(req({ letter_due: "before_card", has_training_media: false, new_user_url: null, has_orientation: false, training_loads_required: 1 }), prog(), 1);
  assert.deepEqual(card.map((x) => [x.key, x.state]), [["load:1", "done"], ["letter", "next"], ["card", "blocked"]]);
});

test("out of order and adjustments", () => {
  const s = accessSteps(req({ letter_required: false }), prog({ orientation_done_at: "x", loads_adjust: 2 }), 1);
  assert.equal(s.find((x) => x.key === "orientation")!.state, "done");
  assert.equal(s.find((x) => x.key === "load:3")!.state, "done");
  assert.equal(s.find((x) => x.key === "letter"), undefined);
  assert.equal(requirementsComplete(null), false);
  assert.equal(requirementsComplete(req()), true);
  assert.equal(requirementsComplete(req({ has_orientation: null })), false);
});
