import { test } from "node:test";
import assert from "node:assert/strict";
import { reimbursementColumns, reimbursementSummary, type ReimbursementRow } from "./reimbursements.ts";
import { toCsv } from "../reports/reportShell.ts";

const r = (id: string, amount: number | string, status: ReimbursementRow["status"]): ReimbursementRow => ({ reimbursement_id: id, driver_id: "d1", amount, description: "Love's · Ocala, FL · 100 gal", expense_date: "2026-11-02T15:00:00Z", receipt_path: null, status, note: null });

test("summary: owed is what is not paid or denied; amounts may arrive as strings", () => {
  const s = reimbursementSummary([r("a", "100.50", "pending"), r("b", 50, "approved"), r("c", 25, "paid"), r("d", 999, "denied")]);
  assert.deepEqual(s, [{ label: "Owed", value: "$150.50" }, { label: "Paid", value: "$25.00" }, { label: "To review", value: "1" }]);
});

test("the CSV has a driver name and a plain amount per row", () => {
  const csv = toCsv(reimbursementColumns(() => "Seth Perry"), [r("a", "12.3", "pending")]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Driver,Date,What,Amount,Status");
  assert.ok(lines[1].startsWith("Seth Perry,"));
  assert.ok(lines[1].includes(",12.30,To review"));
});
