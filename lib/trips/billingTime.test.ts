import { test } from "node:test";
import assert from "node:assert/strict";
import { billingTime, fmtMinutes } from "./billingTime.ts";

const t = (hhmm: string) => `2026-10-12T${hhmm}:00Z`;

test("rack hop: travel, each rack, the loading stretch, then delivery", () => {
  const b = billingTime(
    t("06:00"),
    [
      { kind: "rack", name: "Marathon", arrivedAt: t("06:30"), beginAt: null, leftAt: t("07:15"), noLoad: true, noLoadReason: "long_line" },
      { kind: "rack", name: "Citgo", arrivedAt: t("07:40"), beginAt: t("08:00"), leftAt: t("08:30"), delayReason: null },
    ],
    [{ kind: "delivery", name: "Store 12", arrivedAt: t("09:30"), beginAt: t("09:40"), leftAt: t("10:20") }],
  );
  assert.equal(b.travelToRack, 30);
  assert.equal(b.loadingSpan, 120); // 06:30 → 08:30, both racks
  assert.equal(b.racksTried, 2);
  assert.equal(b.travelToDelivery, 60);
  assert.equal(b.atDeliveries, 50);
  assert.equal(b.totalTravel, 30 + 25 + 60);
  assert.equal(b.total, 260);
  const marathon = b.rows.find((r) => r.type === "stop" && r.name === "Marathon");
  assert.deepEqual(marathon, { type: "stop", kind: "rack", name: "Marathon", onSite: 45, waited: null, working: null, noLoad: true, reason: "Long Line" });
  const citgo = b.rows.find((r) => r.type === "stop" && r.name === "Citgo");
  assert.equal(citgo && citgo.type === "stop" && citgo.waited, 20);
});

test("missing times stay blank instead of guessing", () => {
  const b = billingTime(null, [{ kind: "rack", name: "A", arrivedAt: null, beginAt: null, leftAt: null }], []);
  assert.equal(b.travelToRack, null);
  assert.equal(b.loadingSpan, null);
  assert.equal(b.total, null);
  assert.equal(b.rows[0].type === "travel" && b.rows[0].minutes, null);
});

test("other with a note", () => {
  const b = billingTime(t("06:00"), [{ kind: "rack", name: "A", arrivedAt: t("06:10"), beginAt: null, leftAt: t("06:20"), noLoad: true, noLoadReason: "other", noLoadNote: "Card wouldn't read" }], []);
  const s = b.rows[1];
  assert.equal(s.type === "stop" && s.reason, "Card wouldn't read");
});

test("format", () => {
  assert.equal(fmtMinutes(45), "45m");
  assert.equal(fmtMinutes(125), "2h 05m");
  assert.equal(fmtMinutes(null), "—");
});
