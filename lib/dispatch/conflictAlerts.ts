// lib/dispatch/conflictAlerts.ts
//
// Dispatch Dashboard, LIVE mode: knowing when something NEW went wrong.
// A "pair" is one report touching one truck (terminal|trip|report). A pair we
// haven't seen before is new: a report landing on a truck already headed
// there, or a truck pointed at a rack that already has a report. Pure.

import type { Conflict } from "./conflicts.ts";

export function conflictPairs(conflicts: Conflict[]): string[] {
  const out: string[] = [];
  for (const c of conflicts) {
    for (const t of c.trucks) for (const r of t.reportIds) out.push(`${c.terminalId}|${t.tripId}|${r}`);
  }
  return out;
}

// What changed since `known`. `fresh` are the pairs not in `known`, `terminalIds`
// the terminals they sit at (for the NEW marker).
export function diffNew(known: Set<string>, conflicts: Conflict[]): { fresh: string[]; terminalIds: Set<string> } {
  const fresh = conflictPairs(conflicts).filter((p) => !known.has(p));
  return { fresh, terminalIds: new Set(fresh.map((p) => p.split("|")[0])) };
}

// One notification body for the new pairs, e.g. "Marathon: Long line (2 trucks)".
export function notificationBody(
  conflicts: Conflict[],
  fresh: string[],
  terminalName: (id: string) => string,
  reportLabel: (c: Conflict, reportId: string) => string,
): { title: string; body: string } {
  const byTerminal = new Map<string, { trucks: Set<string>; reports: Set<string> }>();
  for (const p of fresh) {
    const [terminalId, tripId, reportId] = p.split("|");
    const e = byTerminal.get(terminalId) ?? { trucks: new Set(), reports: new Set() };
    e.trucks.add(tripId);
    e.reports.add(reportId);
    byTerminal.set(terminalId, e);
  }
  const lines: string[] = [];
  for (const [terminalId, e] of byTerminal) {
    const c = conflicts.find((x) => x.terminalId === terminalId);
    const what = c ? [...e.reports].map((r) => reportLabel(c, r)).join(", ") : "Problem reported";
    lines.push(`${terminalName(terminalId)}: ${what} (${e.trucks.size} truck${e.trucks.size === 1 ? "" : "s"})`);
  }
  const n = byTerminal.size;
  return { title: n === 1 ? "New conflict" : `${n} new conflicts`, body: lines.join("\n") };
}
