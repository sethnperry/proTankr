// lib/dispatch/watch.ts
//
// Dispatch Dashboard, LIVE mode: terminals with an active report that no
// company truck is headed to. Quieter than a conflict; it's there so a
// dispatcher doesn't send the next truck into a known problem. Pure.

import type { ActiveReport } from "./conflicts.ts";

export type WatchTerminal = { terminalId: string; reports: ActiveReport[]; newestAt: string };

export function watchList(reports: ActiveReport[], headedTerminalIds: Set<string>): WatchTerminal[] {
  const by = new Map<string, ActiveReport[]>();
  for (const r of reports) {
    if (headedTerminalIds.has(r.terminalId)) continue;
    const l = by.get(r.terminalId) ?? [];
    l.push(r);
    by.set(r.terminalId, l);
  }
  return [...by].map(([terminalId, reps]) => {
    const sorted = [...reps].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { terminalId, reports: sorted, newestAt: sorted[0].createdAt };
  }).sort((a, b) => b.newestAt.localeCompare(a.newestAt));
}

// Terminals worth watching: where the company has cards or has loaded lately.
export function companyTerminalSet(accessTerminalIds: string[], loadTerminalIds: string[], headed: string[]): string[] {
  return [...new Set([...accessTerminalIds, ...loadTerminalIds, ...headed].filter(Boolean))].sort();
}
