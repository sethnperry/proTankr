import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters, csvEscape, filterOptions, sumColumn, toCsv, toReportDoc, type ShellColumn, type ShellFilter } from "./reportShell.ts";

type Row = { driver: string; unit: string; minutes: number; note?: string };
const rows: Row[] = [
  { driver: "Seth Perry", unit: "25184", minutes: 45, note: 'said "stuck"' },
  { driver: "Seth Perry", unit: "25190", minutes: 15 },
  { driver: "Pedro Guzman", unit: "25184", minutes: 30, note: "wait, gate" },
];
const cols: ShellColumn<Row>[] = [
  { key: "d", label: "Driver", get: (r) => r.driver, weight: 2 },
  { key: "u", label: "Unit", get: (r) => r.unit },
  { key: "m", label: "Minutes", get: (r) => r.minutes, align: "r" },
  { key: "n", label: "Note", get: (r) => r.note },
];
const filters: ShellFilter<Row>[] = [
  { id: "driver", label: "Driver", of: (r) => r.driver },
  { id: "unit", label: "Unit", of: (r) => r.unit, show: (v) => `Truck ${v}` },
];

test("filter options are the distinct values, sorted, with their labels", () => {
  assert.deepEqual(filterOptions(rows, filters[1]), [{ value: "25184", label: "Truck 25184" }, { value: "25190", label: "Truck 25190" }]);
});

test("filters combine; an empty pick means all", () => {
  assert.equal(applyFilters(rows, filters, {}).length, 3);
  assert.equal(applyFilters(rows, filters, { driver: "Seth Perry" }).length, 2);
  assert.equal(applyFilters(rows, filters, { driver: "Seth Perry", unit: "25190" }).length, 1);
  assert.equal(applyFilters(rows, filters, { driver: "Pedro Guzman", unit: "25190" }).length, 0);
});

test("CSV quotes what needs it and keeps a header", () => {
  const csv = toCsv(cols, rows);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Driver,Unit,Minutes,Note");
  assert.equal(lines[1], 'Seth Perry,25184,45,"said ""stuck"""');
  assert.equal(lines[2], "Seth Perry,25190,15,");
  assert.equal(lines[3], 'Pedro Guzman,25184,30,"wait, gate"');
  assert.equal(csvEscape("plain"), "plain");
});

test("totals and the emailed document come from the same columns", () => {
  assert.equal(sumColumn(cols[2], rows), 90);
  const d = toReportDoc({ title: "Delays", fileName: "delays", columns: cols, rows });
  assert.equal(d.sections[0].table!.rows.length, 3);
  assert.deepEqual(d.sections[0].table!.align, ["l", "l", "r", "l"]);
  assert.ok(Math.abs(d.sections[0].table!.widths.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(d.subject, "Delays");
});
