import { test } from "node:test";
import assert from "node:assert/strict";
import { terminalReadiness, shortName, type ReadinessInput } from "./readiness.ts";

const row = (id: string, over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  terminalId: id, name: id, city: "Tampa", state: "FL", renewalDays: 90, cardedOn: "2026-10-01", starred: true, ...over,
});

test("states follow carded date + renewal days, 7-day warning", () => {
  const r = terminalReadiness([
    row("Alpha", { cardedOn: "2026-10-10" }),          // 86 days left -> ready
    row("Bravo", { cardedOn: "2026-07-20" }),          // expires 10-18 -> 4 days -> expiring
    row("Charlie", { cardedOn: "2026-07-01" }),        // expired
    row("Delta", { cardedOn: null }),                  // starred, not carded
    row("Echo", { city: "Orlando" }),                  // other city
    row("Fox", { cardedOn: null, starred: false }),    // not starred, no access -> skipped
  ], { city: "tampa", state: "fl", todayIso: "2026-10-14" });
  assert.deepEqual(r.segments.map((s) => [s.name, s.state]), [
    ["Alpha", "ready"], ["Bravo", "expiring"], ["Charlie", "expired"], ["Delta", "none"],
  ]);
  assert.equal(r.segments[1].daysLeft, 4);
  assert.equal(r.headline?.tone, "bad");
  assert.match(r.headline!.text, /Charlie expired/);
  assert.ok(r.segments[0].remaining > 0.9 && r.segments[0].remaining <= 1);
});

test("pickup terminal's problem leads; healthy city shows the next renewal", () => {
  const rows = [row("Alpha", { cardedOn: "2026-10-10" }), row("Bravo", { cardedOn: null })];
  const p = terminalReadiness(rows, { city: "Tampa", state: "FL", todayIso: "2026-10-14", pickupTerminalId: "Bravo" });
  assert.equal(p.headline?.text, "Pickup: Not carded at Bravo");
  const ok = terminalReadiness([rows[0]], { city: "Tampa", state: "FL", todayIso: "2026-10-14" });
  assert.equal(ok.headline?.tone, "ok");
  assert.match(ok.headline!.text, /Alpha in 86 days/);
  assert.equal(shortName("Buckey North"), "BN");
  assert.equal(shortName("Citgo"), "CI");
});
