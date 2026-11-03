import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSetup, counterText, adminLine, STEPS, type SetupFacts } from "./driverSetup.ts";

const blank: SetupFacts = {
  tier: "solo", profile: {}, regionsDefined: false, license: {}, medical: {}, scheduleDays: 0,
  hasTruck: false, hasTrailer: false, plansSaved: 0, terminalsStarred: 0, locationsStarred: 0,
  fuelProgram: false, hasFuelPin: false, pushSupported: true, pushOn: false,
  telematicsConnected: false, hoursLinked: false, hasPerDiemHome: false, vaultSet: false,
};
const filled = (over: Partial<SetupFacts> = {}): SetupFacts => ({
  ...blank, profile: { displayName: "J", employeeNumber: "7", region: "SE", localArea: "Tampa" },
  license: { number: "X1", expiry: "2027-01-01" }, medical: { expiry: "2027-01-01" }, hasTruck: true, plansSaved: 1, ...over,
});
const by = (s: ReturnType<typeof computeSetup>, id: string) => s.steps.find((x) => x.id === id)!;

test("a blank solo driver needs every required step and nothing is skippable", () => {
  const s = computeSetup(blank);
  assert.deepEqual(s.steps.filter((x) => x.status === "needs").map((x) => x.id), ["you", "license", "equipment", "plans"]);
  assert.equal(s.requiredLeft, 4);
  assert.equal(s.next, "you");
  assert.equal(s.complete, false);
});

test("solo: schedule, fuel PIN, hours don't apply and aren't counted", () => {
  const s = computeSetup(blank);
  assert.equal(by(s, "schedule").status, "na");
  assert.equal(by(s, "fuel_pin").status, "na");
  assert.equal(by(s, "hours").status, "na");
  assert.equal(s.total, STEPS.length - 3);
});

test("the region and local area are only required where regions exist (solo with none defined)", () => {
  const f = filled({ profile: { displayName: "J", employeeNumber: "7" } });
  assert.equal(by(computeSetup(f), "you").status, "done");
  assert.equal(by(computeSetup({ ...f, regionsDefined: true }), "you").status, "needs");
  assert.match(by(computeSetup({ ...f, regionsDefined: true }), "you").detail, /region, local area/);
});

test("fleet: preset data waits for the driver to confirm, then is done", () => {
  const f = filled({ tier: "fleet", scheduleDays: 5 });
  const before = computeSetup(f);
  assert.deepEqual(before.steps.filter((x) => x.status === "confirm").map((x) => x.id), ["you", "license", "schedule", "equipment"]);
  assert.equal(before.requiredLeft, 3);
  const after = computeSetup(f, { you: "2026-11-03T10:00:00Z", license: "2026-11-03T10:00:00Z", schedule: "x", equipment: "x" });
  assert.equal(by(after, "you").status, "done");
  assert.equal(by(after, "you").detail, "Confirmed");
  assert.equal(after.requiredLeft, 0);
});

test("fleet: missing required data is 'needs', not 'confirm', even when confirmed earlier", () => {
  const f = filled({ tier: "fleet", profile: { displayName: "J" } });
  const s = computeSetup(f, { you: "2026-11-01T00:00:00Z" });
  assert.equal(by(s, "you").status, "needs");
  assert.equal(s.next, "you");
});

test("steps that need the company to have something are left out otherwise", () => {
  const s = computeSetup(filled({ tier: "fleet", fuelProgram: true, telematicsConnected: true, pushSupported: false }));
  assert.equal(by(s, "fuel_pin").status, "open");
  assert.equal(by(s, "hours").status, "open");
  assert.equal(by(s, "alerts").status, "na");
});

test("optional steps stay open without blocking; required-first ordering for next", () => {
  const s = computeSetup(filled());
  assert.equal(s.requiredLeft, 0);
  assert.equal(by(s, "terminals").status, "open");
  assert.equal(s.next, "terminals");
  const noPlan = computeSetup(filled({ plansSaved: 0 }));
  assert.equal(noPlan.next, "plans");
});

test("complete once every counted step is done", () => {
  const all = filled({ tier: "fleet", scheduleDays: 5, terminalsStarred: 2, locationsStarred: 1, fuelProgram: true, hasFuelPin: true,
    pushOn: true, telematicsConnected: true, hoursLinked: true, hasPerDiemHome: true, vaultSet: true });
  const conf = Object.fromEntries(STEPS.map((x) => [x.id, "2026-11-03T00:00:00Z"]));
  const s = computeSetup(all, conf);
  assert.equal(s.complete, true);
  assert.equal(s.done, s.total);
  assert.equal(counterText(s), "12 of 12");
});

test("the admin line says what is blocking", () => {
  assert.equal(adminLine(computeSetup(blank)).tone, "bad");
  assert.match(adminLine(computeSetup(blank)).text, /4 required left/);
  assert.equal(adminLine(computeSetup(filled())).tone, "warn");
});
