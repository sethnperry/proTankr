import { test } from "node:test";
import assert from "node:assert/strict";
import { beginBlockMessage as m, type BeginBlockState } from "./beginBlock.ts";

const ok: BeginBlockState = { tripNeedsArrive: false, presetsReady: true, hasCombo: true, hasTerminal: true, plannedProducts: 3, terminalProducts: 8, unavailableComps: 0 };

test("each reason has its own message", () => {
  assert.match(m({ ...ok, tripNeedsArrive: true }).title, /Arrive/);
  assert.match(m({ ...ok, hasCombo: false }).title, /equipment/);
  assert.match(m({ ...ok, hasTerminal: false }).title, /Terminal/);
  assert.match(m({ ...ok, presetsReady: false }).title, /loading/);
  assert.match(m({ ...ok, plannedProducts: 0 }).title, /No plan/);
});
test("no terminal products, or products that don't match the plan", () => {
  assert.match(m({ ...ok, terminalProducts: 0 }).text, /verify the terminal products/);
  assert.match(m({ ...ok, unavailableComps: 2 }).text, /verify the terminal products/);
});
test("anything else still says something", () => {
  assert.match(m(ok).title, /Couldn't start/);
});
