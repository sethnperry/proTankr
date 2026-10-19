// lib/dispatch/acks.ts
//
// A dispatcher can mark a conflict handled and leave a note. Acks are stored
// per report; a conflict reads as handled only while EVERY report in it is
// acked, so a fresh report re-opens it. Pure.

import type { Conflict } from "./conflicts.ts";

export type Ack = { reportId: string; by: string | null; at: string; note: string | null };
export type HandledInfo = { by: string | null; at: string; note: string | null };
export type ConflictWithAck = Conflict & { handled: HandledInfo | null };

export function applyAcks(conflicts: Conflict[], acks: Map<string, Ack>): ConflictWithAck[] {
  const out = conflicts.map((c) => {
    const mine = c.reports.map((r) => acks.get(r.reportId));
    if (mine.length === 0 || mine.some((a) => !a)) return { ...c, handled: null };
    const newest = (mine as Ack[]).reduce((m, a) => (a.at > m.at ? a : m));
    // Keep a note from any ack if the newest has none.
    const note = newest.note ?? (mine as Ack[]).find((a) => a.note)?.note ?? null;
    return { ...c, handled: { by: newest.by, at: newest.at, note } };
  });
  // Open conflicts first (keeping their order), handled ones after.
  return [...out.filter((c) => !c.handled), ...out.filter((c) => c.handled)];
}
