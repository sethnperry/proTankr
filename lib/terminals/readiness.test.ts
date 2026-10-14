import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalReadiness, shortName, type ReadinessInput } from "./readiness.ts";

const row = (id: string, over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  terminalId: id, name: id, city: "Tampa", state: "FL", renewalDays: 90, cardedOn: "2026-10-01", ...over,
});
const today = "2026-10-14";

test("every city terminal shows; levels follow the app-wide rule", () => {
  const r = terminalReadiness([
    row("Alpha", { cardedOn: "2026-10-14" }),   // 90 left -> ready, full
    row("Bravo", { cardedOn: "2026-08-01" }),   // expires 10-30 -> 16 -> soon
    row("Charlie", { cardedOn: "2026-07-20" }), // expires 10-18 -> 4 -> expiring
    row("Delta", { cardedOn: "2026-07-01" }),   // expired 15 days ago
    row("Echo", { cardedOn: "2026-05-01" }),    // expired 76 days ago -> timed out
    row("Fox", { cardedOn: null }),             // never carded
    row("Golf", { city: "Orlando" }),           // other city
  ], { city: "tampa", state: "fl", todayIso: today });
  assert.deepEqual(r.segments.map((s) => [s.name, s.state]), [
    ["Alpha", "ready"], ["Bravo", "soon"], ["Charlie", "expiring"], ["Delta", "expired"],
    ["Echo", "none"], ["Fox", "none"],
  ]);
  assert.equal(r.segments[0].remaining, 1);
  assert.equal(r.segments[4].timedOut, true);
  assert.equal(r.access, 3);
  assert.equal(r.none, 2);
  assert.equal(r.headline?.tone, "bad");
  assert.match(r.headline!.text, /Delta expired 15 days ago/);
});

test("pickup problem leads; healthy city shows the next renewal", () => {
  const rows = [row("Alpha", { cardedOn: "2026-10-10" }), row("Bravo", { cardedOn: null })];
  const p = terminalReadiness(rows, { city: "Tampa", state: "FL", todayIso: today, pickupTerminalId: "Bravo" });
  assert.equal(p.headline?.text, "Pickup: No access at Bravo");
  const ok = terminalReadiness([rows[0]], { city: "Tampa", state: "FL", todayIso: today });
  assert.equal(ok.headline?.tone, "ok");
  assert.match(ok.headline!.text, /Alpha in 86 days/);
  const soon = terminalReadiness([row("Alpha", { cardedOn: "2026-08-01" })], { city: "Tampa", state: "FL", todayIso: today });
  assert.equal(soon.headline?.tone, "soon");
  assert.equal(shortName("Buckey North"), "BN");
  assert.equal(shortName("Citgo"), "CI");
});
