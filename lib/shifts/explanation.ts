// lib/shifts/explanation.ts
//
// The Shift Explanation: why a shift ran past the company's limit. Asked when the driver ends a long shift; the
// answer is a shift event. Pure: the payload, the check for "does this End need the question", and the manager's
// list of long shifts (with the answer, or the lack of one).

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";
import type { ShiftEventRow } from "../trips/types.ts";
import { SHIFT_EXPLANATION, clockHM, deriveShifts, isLongShift, type Shift } from "./shiftLogic.ts";
import { categoryLabel } from "../reasons/reasons.ts";

export type ExplanationPick = { reasonId: string | null; label: string; category: string | null; note: string | null };
export type ExplanationPayload = { reason: string; reason_id: string | null; category: string | null; note: string | null; hours: number };

/** Ending this shift should ask the question: it is past the limit and nobody has answered yet. */
export function endNeedsExplanation(s: Shift | null, maxHours: number): boolean {
  return !!s && s.open && isLongShift(s, maxHours) && !s.events.some((e) => e.event_type === SHIFT_EXPLANATION);
}

export function explanationProblem(pick: ExplanationPick | null): string | null {
  if (!pick) return "Pick what happened.";
  if (pick.reasonId == null && !pick.note?.trim()) return "Say what happened.";
  return null;
}

export const explanationPayload = (pick: ExplanationPick, hours: number): ExplanationPayload => ({
  reason: pick.label, reason_id: pick.reasonId && !pick.reasonId.startsWith("default-") ? pick.reasonId : null,
  category: pick.category, note: pick.note?.trim() || null, hours: Math.round(hours * 100) / 100,
});

export type LongShiftRow = {
  key: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  hours: number;
  open: boolean;
  unconfirmed: boolean;
  explanation: { reason: string; category: string | null; note: string | null } | null;
};

/** Every shift over the limit in these events, newest first. `since` keeps the list to recent days. */
export function longShifts(events: ShiftEventRow[], maxHours: number, now: string, since: string): LongShiftRow[] {
  const users = [...new Set(events.map((e) => e.user_id))];
  const out: LongShiftRow[] = [];
  for (const u of users) {
    for (const s of deriveShifts(events, u, now)) {
      if (s.startedAt < since || !isLongShift(s, maxHours)) continue;
      const ex = s.events.find((e) => e.event_type === SHIFT_EXPLANATION);
      const p = (ex?.payload ?? {}) as Partial<ExplanationPayload>;
      out.push({
        key: `${u}|${s.startedAt}`, userId: u, startedAt: s.startedAt, endedAt: s.endedAt, hours: s.hours, open: s.open, unconfirmed: s.unconfirmed,
        explanation: ex ? { reason: p.reason ?? "", category: p.category ?? null, note: p.note ?? null } : null,
      });
    }
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export const unexplained = (rows: LongShiftRow[]) => rows.filter((r) => !r.explanation);

const day = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };

export function longShiftColumns(nameOf: (id: string) => string): ShellColumn<LongShiftRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => day(r.startedAt), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.userId), weight: 1.2 },
    { key: "hours", label: "Hours", get: (r) => clockHM(r.hours), align: "r", weight: 0.7 },
    { key: "why", label: "Explanation", get: (r) => (r.explanation ? [r.explanation.reason, r.explanation.note].filter(Boolean).join(" · ") : "None"), weight: 2 },
  ];
}

export function longShiftFilters(nameOf: (id: string) => string, regionOf: (id: string) => string): ShellFilter<LongShiftRow>[] {
  return [
    { id: "region", label: "Region", of: (r) => regionOf(r.userId) },
    { id: "driver", label: "Driver", of: (r) => r.userId, show: nameOf },
    { id: "cat", label: "Category", of: (r) => (r.explanation ? r.explanation.category ?? "other" : "none"), show: (v) => (v === "none" ? "No explanation" : categoryLabel(v) || v) },
  ];
}
