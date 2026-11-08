import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDay, meetConsequence, type DayContext, type DayTrip } from "./validateDay.ts";
import { DEFAULT_TIMELINE_SETTINGS } from "./forecast.ts";

const T0 = Date.parse("2026-11-09T14:00:00Z");
const ll = (lat: number, lon: number) => ({ lat, lon });
const ctx = (over: Partial<DayContext> = {}): DayContext => ({
  startMs: T0, startFrom: null,
  terminals: new Map([["T1", { name: "Shell", tz: "America/New_York", ll: ll(27.9, -82.4), renewalDays: 90 }]]),
  locations: new Map([["L1", { name: "Store 1", ll: ll(28.0, -82.5) }], ["L2", { name: "Store 2", ll: ll(28.1, -82.6) }]]),
  history: [], driverId: "d1", settings: DEFAULT_TIMELINE_SETTINGS, hos: null, nowMs: T0 - 86400000,
  access: [{ terminal_id: "T1", carded_on: "2026-10-20" }], todayIso: "2026-11-09",
  trailerCertBad: () => false, allocWarning: () => null, supplierWarning: () => null,
  othersAtDrop: () => [], othersAtTerminal: () => [], credentials: [], calloutText: null, restText: null,
  ...over,
});
const trip = (id: string, loc = "L1"): DayTrip => ({ id, terminalId: "T1", locationId: loc, supplierId: null, orderNumber: "1", shipper: "", customer: "" });

test("a clean single trip raises nothing and lists the passed checks", () => {
  const r = validateDay([trip("a")], ctx());
  assert.equal(r.issues.length, 0);
  assert.ok(r.passed.includes("Access") && r.passed.includes("Hours"));
});

test("not carded is a decision with the three fixes", () => {
  const r = validateDay([trip("a")], ctx({ access: [] }));
  const i = r.issues.find((x) => x.kind === "access")!;
  assert.equal(i.tier, "decide");
  assert.deepEqual(i.fixes, ["meet", "terminal", "ignore"]);
  assert.ok(!r.passed.includes("Access"));
});

test("access expiring soon is only a heads-up", () => {
  const r = validateDay([trip("a")], ctx({ access: [{ terminal_id: "T1", carded_on: "2026-08-15" }] }));
  assert.equal(r.issues.find((x) => x.kind === "access_soon")?.tier, "heads");
});

test("trips chain: the second starts when the first ends", () => {
  const r = validateDay([trip("a"), trip("b", "L2")], ctx());
  assert.equal(r.trips[1].startMs, r.trips[0].forecast.endMs);
  assert.equal(r.endMs, r.trips[1].forecast.endMs);
});

test("a long day goes over the shift limit", () => {
  const r = validateDay([trip("a"), trip("b", "L2"), trip("c"), trip("d", "L2"), trip("e"), trip("f", "L2")], ctx());
  assert.ok(r.issues.some((x) => x.kind === "shift" && x.tier === "decide"));
});

test("cert, allocation, call-out and credentials are decisions; crowding is a heads-up", () => {
  const r = validateDay([trip("a")], ctx({
    trailerCertBad: () => true, allocWarning: () => "Over the daily limit.", calloutText: "Called out.",
    credentials: [{ label: "Medical card", days: 5 }, { label: "TWIC", days: 20 }],
    othersAtTerminal: () => [{ name: "Bob", etaMs: T0 + 30 * 60000 }],
  }));
  const tier = (k: string) => r.issues.filter((x) => x.kind === k).map((x) => x.tier);
  assert.deepEqual(tier("cert"), ["decide"]);
  assert.deepEqual(tier("alloc"), ["decide"]);
  assert.deepEqual(tier("callout"), ["decide"]);
  assert.deepEqual(tier("credential"), ["decide", "heads"]);
  assert.deepEqual(tier("crowd"), ["heads"]);
});

test("the allocation check sees the load time, not the start", () => {
  let seen = 0;
  const r = validateDay([trip("a")], ctx({ allocWarning: (_t, ms) => { seen = ms; return null; } }));
  assert.equal(seen, r.trips[0].loadStartMs);
  assert.ok(seen > T0);
});

test("meet: first to arrive waits, the wait lands on their trip", () => {
  const m = meetConsequence(
    { name: "Ann", startMs: 0, arriveMs: 3_600_000, endMs: 10 * 3_600_000 },
    { name: "Bob", startMs: 0, arriveMs: 3_600_000 + 45 * 60000, endMs: 9 * 3_600_000 },
  );
  assert.equal(m.first, "Ann"); assert.equal(m.waitMin, 45);
  assert.equal(m.sides[0].waitMin, 45); assert.equal(m.sides[1].waitMin, 0);
  assert.equal(m.sides[0].newEndMs, 10 * 3_600_000 + 45 * 60000);
  assert.equal(m.sides[0].shiftHours, 10.75);
});
