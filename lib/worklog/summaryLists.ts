// lib/worklog/summaryLists.ts
//
// The DROP Report's summary as two short lists (time on the left, loads and miles on the right), the
// same rows for the on-screen document and the PDF. Pure.

import type { Worklog } from "./buildWorklog.ts";

export type SumRow = { k: string; v: string; sub?: string; tone?: "good" | "warn" };
export type SumList = { title: string; rows: SumRow[] };

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const hr = (n: number) => n.toFixed(1);
const money = (n: number) => `$${n.toFixed(2)}`;

export const KINDS = ["Weekly", "Biweekly", "Semi-monthly", "Monthly"];

/** "Weekly DROP Report"; a custom range is just "DROP Report". DROP = Driver Recap Of Productivity. */
export function dropTitle(title: string): string { return KINDS.includes(title) ? `${title} DROP Report` : "DROP Report"; }
export const DROP_SUBTITLE = "Driver Recap of Productivity";

export function utilizationRow(u: Worklog["utilization"]): SumRow {
  if (!u || u.pct == null) return { k: "Utilization score", v: "–", sub: u && u.excluded ? `${u.excluded} load${u.excluded === 1 ? "" : "s"} not scored` : "no scored loads" };
  return {
    k: "Utilization score", v: `${u.pct.toFixed(1)}%`, tone: u.pct >= 95 ? "good" : "warn",
    sub: `${u.loads} load${u.loads === 1 ? "" : "s"}${u.excluded ? `, ${u.excluded} not scored` : ""}`,
  };
}

export function summaryLists(w: Worklog): [SumList, SumList] {
  const s = w.summary, m = s.miles;
  const hasDuty = s.nonRev != null;
  const time: SumRow[] = [
    { k: "Days worked", v: String(s.daysWorked) },
    { k: "Hours worked", v: hr(s.worked), sub: hasDuty ? `trip ${hr(s.tripHours)}, non-rev ${hr(s.nonRev ?? 0)}` : undefined },
    { k: "Regular hours", v: hr(s.regular) },
    { k: "Overtime hours", v: hr(s.overtime + s.double), sub: s.double > 0 ? `incl. ${hr(s.double)} double time` : undefined },
    { k: "Non-rev hours", v: s.nonRev == null ? "–" : hr(s.nonRev), sub: s.nonRev == null ? "needs electronic log" : undefined },
  ];
  const work: SumRow[] = [
    { k: "Loads", v: String(s.loads) },
    utilizationRow(w.utilization),
    { k: "Gross gallons", v: num(s.gross) },
    { k: "Net gallons", v: num(s.net) },
    { k: "Loaded miles", v: m.loaded == null ? "–" : num(m.loaded), sub: m.partial ? "tracked trips only" : undefined },
    { k: "Empty miles", v: m.empty == null ? "–" : num(m.empty) },
    { k: "Total miles", v: num(m.total) },
    { k: "Paid by you", v: money(s.spend), sub: "card or cash" },
  ];
  return [{ title: "Time", rows: time }, { title: "Loads & miles", rows: work }];
}
