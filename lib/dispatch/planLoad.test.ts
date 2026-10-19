import test from "node:test";
import assert from "node:assert/strict";
import { rankDrivers, focusAlerts, accessAt } from "./planLoad.ts";

const roster = [
  { user_id: "a", display_name: "Ann", region: null },
  { user_id: "b", display_name: "Bob", region: null },
  { user_id: "c", display_name: "Cy", region: null },
  { user_id: "d", display_name: "Di", region: null },
];
const T = "2026-10-20";
const del = (driver_id: string, finished_at: string) => ({ driver_id, finished_at });

test("ranked by how often, not how recently", () => {
  const r = rankDrivers({ roster, deliveries: [del("a", "2026-10-19"), del("b", "2026-01-01"), del("b", "2026-02-01"), del("b", "2026-03-01")] });
  assert.deepEqual(r.ready.map((x) => x.userId), ["b", "a", "c", "d"]);
});

test("a tie in count goes to the more recent", () => {
  const r = rankDrivers({ roster, deliveries: [del("a", "2026-01-01"), del("b", "2026-05-01")] });
  assert.deepEqual(r.ready.slice(0, 2).map((x) => x.userId), ["b", "a"]);
});

test("terminal narrows: no access moves a known driver to notCarded, others just drop out", () => {
  const r = rankDrivers({
    roster, deliveries: [del("a", "2026-10-01"), del("b", "2026-10-01")],
    terminalId: "t1", renewalDays: 90, todayIso: T,
    access: [{ user_id: "a", terminal_id: "t1", carded_on: "2026-10-01" }, { user_id: "c", terminal_id: "t1", carded_on: "2026-10-01" }],
  });
  assert.deepEqual(r.ready.map((x) => x.userId), ["a", "c"]);
  assert.deepEqual(r.notCarded.map((x) => x.userId), ["b"]); // delivered here, not carded
  assert.deepEqual([...r.focusIds], ["a"]);
});

test("expired access is not ready; access 5 days out is, flagged expiring", () => {
  assert.equal(accessAt("2026-07-01", 90, T).state, "expired");   // ended 2026-09-29
  assert.equal(accessAt("2026-07-27", 90, T).state, "expiring");  // ends 2026-10-25
  assert.equal(accessAt("2025-01-01", 90, T).state, "none");      // timed out
  assert.equal(accessAt(null, 90, T).state, "none");
});

test("nobody has delivered here: no one is ruled out", () => {
  const r = rankDrivers({ roster, deliveries: [] });
  assert.equal(r.focusIds.size, 4);
});

test("expirations follow the shortlist and drop equipment", () => {
  const mk = (subjectId: string, isEquipment = false) => ({ key: subjectId + isEquipment, kind: "license", subject: "x", subjectId, isEquipment, label: "", iso: "", days: 1, state: "expiring" }) as any;
  const out = focusAlerts([mk("a"), mk("b"), mk("truck1", true)], new Set(["a"]));
  assert.deepEqual(out.map((x) => x.subjectId), ["a"]);
  assert.equal(focusAlerts([mk("a")], null).length, 1);
});
