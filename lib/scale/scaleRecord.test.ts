import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot, buildWeightRecordRow, weighProblem, type WeighInput } from "./scaleRecord.ts";

const base: WeighInput = { scaleType: "private", heavy: "79840", light: "25265", citation: false, citationKind: null, citationNumber: "", citationAmount: "", citationNote: "" };

test("a private scale needs both weighs, a DOT scale only the loaded one", () => {
  assert.equal(weighProblem(base), null);
  assert.match(weighProblem({ ...base, light: "" })!, /both/);
  assert.equal(weighProblem({ ...base, scaleType: "dot", light: "" }), null);
  assert.match(weighProblem({ ...base, scaleType: "dot", light: "90000" })!, /less than/);
  assert.match(weighProblem({ ...base, heavy: "" })!, /loaded/);
});

test("a citation has to say what it was for", () => {
  assert.match(weighProblem({ ...base, citation: true })!, /citation/);
  assert.equal(weighProblem({ ...base, citation: true, citationKind: "gross" }), null);
});

test("the row keeps the snapshot, the empty weigh may be null, tare only moves when asked", () => {
  const snapshot = buildSnapshot({ now: "2026-11-03T10:00:00Z", loadId: "L1", loadCompletedAt: "2026-11-03T09:00:00Z", tareLbs: 25000, grossLimitLbs: 80000, plannedNetLbs: 54000, lines: [] });
  assert.equal(snapshot.planned_gross_lbs, 79000);
  const dot = buildWeightRecordRow({ input: { ...base, scaleType: "dot", light: "", citation: true, citationKind: "axle", citationAmount: "$250", citationNumber: " A1 " }, companyId: "c", comboId: "k", userId: "u", loadId: "L1", plannedNetLbs: 54000, priorTareLbs: 25000, updateTare: true, notes: " ", captureId: "cap", snapshot });
  assert.equal(dot.light_weight_lbs, null);
  assert.equal(dot.tare_updated, false, "no empty weigh, so nothing to update tare from");
  assert.deepEqual(dot.citation_detail, { kind: "axle", number: "A1", amount: 250, note: null });
  assert.equal(dot.notes, null);
  const priv = buildWeightRecordRow({ input: base, companyId: "c", comboId: "k", userId: "u", loadId: null, plannedNetLbs: null, priorTareLbs: 25000, updateTare: true, notes: "", captureId: null, snapshot });
  assert.equal(priv.tare_updated, true);
  assert.equal(priv.citation_detail, null);
});

import { scaleColumns, scaleSummary, plannerDiff, weighed, type ScaleReportRow } from "./scaleReport.ts";
import { toCsv } from "../reports/reportShell.ts";

const rep = (o: Partial<ScaleReportRow>): ScaleReportRow => ({ weight_record_id: "1", recorded_at: "2026-11-03T10:00:00Z", created_by: "u", unit: "Truck 25184", scale_type: "private", heavy_weight_lbs: "79840", light_weight_lbs: "25265", planner_weight_lbs: "54500", citation: false, citation_detail: null, planner_snapshot: null, capture_id: null, notes: null, ...o });

test("report: net against the planner, a DOT one-weigh shows the loaded weight, citations are counted", () => {
  assert.equal(weighed(rep({})), 54575);
  assert.equal(plannerDiff(rep({})), 75);
  assert.equal(weighed(rep({ light_weight_lbs: null, scale_type: "dot" })), 79840);
  assert.equal(plannerDiff(rep({ light_weight_lbs: null })), null);
  const rows = [rep({}), rep({ weight_record_id: "2", citation: true, citation_detail: { kind: "axle", number: null, amount: 250, note: null } })];
  assert.deepEqual(scaleSummary(rows), [{ label: "Records", value: "2" }, { label: "Citations", value: "1" }, { label: "Fines", value: "$250" }]);
  const csv = toCsv(scaleColumns(() => "Seth"), rows).split("\r\n");
  assert.ok(csv[1].includes("Truck 25184") && csv[1].includes("+75"));
  assert.ok(csv[2].endsWith("Axle weight"));
});
