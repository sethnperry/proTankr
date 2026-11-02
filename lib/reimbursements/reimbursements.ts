// lib/reimbursements/reimbursements.ts
//
// What the company owes drivers for fuel paid out of pocket. Pure: describes the report's columns, filters and
// summary figures for the report shell. The records themselves are written by a database trigger when a driver
// finishes a My Card or Cash fuel stop.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export type ReimbursementStatus = "pending" | "approved" | "paid" | "denied";
export type ReimbursementRow = {
  reimbursement_id: string;
  driver_id: string;
  amount: number | string;
  description: string;
  expense_date: string;
  receipt_path: string | null;
  status: ReimbursementStatus;
  note: string | null;
};

export const STATUS_LABEL: Record<ReimbursementStatus, string> = { pending: "To review", approved: "Approved", paid: "Paid", denied: "Denied" };

export const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amt = (r: ReimbursementRow) => Number(r.amount) || 0;
const day = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };

export function reimbursementColumns(nameOf: (driverId: string) => string): ShellColumn<ReimbursementRow>[] {
  return [
    { key: "driver", label: "Driver", get: (r) => nameOf(r.driver_id), weight: 1.3 },
    { key: "date", label: "Date", get: (r) => day(r.expense_date), weight: 0.8 },
    { key: "what", label: "What", get: (r) => r.description, weight: 1.6 },
    { key: "amount", label: "Amount", get: (r) => amt(r).toFixed(2), align: "r", weight: 0.9 },
    { key: "status", label: "Status", get: (r) => STATUS_LABEL[r.status], weight: 0.9 },
  ];
}

export function reimbursementFilters(nameOf: (driverId: string) => string): ShellFilter<ReimbursementRow>[] {
  return [
    { id: "driver", label: "Driver", of: (r) => r.driver_id, show: nameOf },
    { id: "status", label: "Status", of: (r) => r.status, show: (v) => STATUS_LABEL[v as ReimbursementStatus] ?? v },
  ];
}

/** Totals over the rows shown. Denied ones are not owed, so they count in neither figure. */
export function reimbursementSummary(rows: ReimbursementRow[]): { label: string; value: string }[] {
  const owed = rows.filter((r) => r.status !== "denied");
  const unpaid = owed.filter((r) => r.status !== "paid");
  const sum = (xs: ReimbursementRow[]) => xs.reduce((t, r) => t + amt(r), 0);
  return [
    { label: "Owed", value: money(sum(unpaid)) },
    { label: "Paid", value: money(sum(owed.filter((r) => r.status === "paid"))) },
    { label: "To review", value: String(rows.filter((r) => r.status === "pending").length) },
  ];
}
