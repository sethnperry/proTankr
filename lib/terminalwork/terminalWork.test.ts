import { test } from "node:test";
import assert from "node:assert/strict";
import { createTripStore } from "../trips/tripStore.ts";
import { byTerminal, billableDefault, effectiveBillable, historyOf, minutesOf, reportRows, running, startProblem, startWork, stopWork, workColumns, workSummary } from "./terminalWork.ts";
import { toCsv } from "../reports/reportShell.ts";

const mk = (activity: any = "rail_transload", defaults: any = {}, id = "00000000-0000-4000-8000-0000000000a1") => {
  const store = createTripStore({ storage: null, storageKey: "tw" + id });
  const row = startWork(store, { companyId: "c", userId: "u", activity, terminalId: "t1", terminalName: "Marathon, Tampa", productId: null, defaults, nowIso: "2026-11-03T14:00:00Z", id });
  return { store, row };
};

test("it needs an activity and a terminal", () => {
  assert.match(startProblem(null, "x")!, /doing/);
  assert.match(startProblem("marshaling", " ")!, /terminal/);
  assert.equal(startProblem("marshaling", "Marathon"), null);
});

test("billable default: the company's choice, else the built-in one", () => {
  assert.equal(billableDefault("marshaling", {}), true);
  assert.equal(billableDefault("yard_work", {}), false);
  assert.equal(billableDefault("yard_work", { yard_work: true }), true);
  assert.equal(billableDefault("marshaling", { marshaling: false }), false);
  assert.equal(mk("yard_work").row.billable, false);
  assert.equal(mk("yard_work", { yard_work: true }).row.billable, true);
});

test("a timer runs until stopped; stopping twice or starting the same id twice changes nothing", () => {
  const { store, row } = mk();
  assert.equal(running(store.list("terminal_work"), "u")?.work_id, row.work_id);
  assert.equal(minutesOf(row, Date.parse("2026-11-03T15:30:00Z")), 90);
  const done = stopWork(store, row.work_id, "2026-11-03T16:00:00Z", " moved 3 cars ")!;
  assert.equal(done.ended_at, "2026-11-03T16:00:00Z"); assert.equal(done.note, "moved 3 cars");
  assert.equal(stopWork(store, row.work_id, "2026-11-03T17:00:00Z")!.ended_at, "2026-11-03T16:00:00Z");
  assert.equal(running(store.list("terminal_work"), "u"), null);
  assert.equal(startWork(store, { companyId: "c", userId: "u", activity: "training", terminalId: null, terminalName: "x", productId: null, defaults: {}, nowIso: "2026-11-04T00:00:00Z", id: row.work_id }).activity, "rail_transload");
});

test("an admin's override wins, the latest one wins, and the history is kept", () => {
  const { row } = mk();
  const o = [{ work_id: row.work_id, billable: false, note: "own error", set_by: "a", set_at: "2026-11-04T10:00:00Z" }, { work_id: row.work_id, billable: true, note: "customer agreed", set_by: "b", set_at: "2026-11-05T10:00:00Z" }];
  assert.deepEqual(effectiveBillable(row, []), { billable: true, overridden: false });
  assert.deepEqual(effectiveBillable(row, o.slice(0, 1)), { billable: false, overridden: true });
  assert.deepEqual(effectiveBillable(row, o), { billable: true, overridden: true });
  assert.deepEqual(historyOf(row.work_id, o).map((x) => x.set_by), ["b", "a"]);
});

test("the report: billable terminal time per terminal, overrides applied, running timers not counted", () => {
  const a = mk("rail_transload", {}, "00000000-0000-4000-8000-0000000000a1");
  stopWork(a.store, a.row.work_id, "2026-11-03T16:00:00Z"); // 120 min billable
  const b = mk("yard_work", {}, "00000000-0000-4000-8000-0000000000a2");
  stopWork(b.store, b.row.work_id, "2026-11-03T15:00:00Z"); // 60 min not billable
  const c = mk("marshaling", {}, "00000000-0000-4000-8000-0000000000a3"); // still running
  const rows = reportRows([...a.store.list("terminal_work"), ...b.store.list("terminal_work"), ...c.store.list("terminal_work")], [], Date.parse("2026-11-03T20:00:00Z"));
  assert.deepEqual(workSummary(rows), [{ label: "Billable", value: "2:00" }, { label: "Not billable", value: "1:00" }, { label: "Records", value: "3" }]);
  assert.deepEqual(byTerminal(rows), [{ terminal: "Marathon, Tampa", billable: 120, notBillable: 60 }]);
  const overridden = reportRows(b.store.list("terminal_work"), [{ work_id: b.row.work_id, billable: true, note: null, set_by: "a", set_at: "2026-11-04T00:00:00Z" }], Date.parse("2026-11-03T20:00:00Z"));
  assert.equal(workSummary(overridden)[0].value, "1:00");
  assert.ok(toCsv(workColumns(() => "Seth", () => ""), overridden).includes("Yes *"));
});
