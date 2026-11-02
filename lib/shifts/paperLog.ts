// lib/shifts/paperLog.ts
//
// A paper log is a shift event: the driver is keeping the day on paper (ELD down, battery dead, a roadside
// inspection) and photographs the pages. Pure: the event's type and payload, and how a stored event reads back.

export type ReasonPick = { reasonId: string | null; label: string; category: string | null; note: string | null };

export const PAPER_LOG_EVENT = "paper_log";

export type PaperLogPayload = { reason: string; reason_id: string | null; category: string | null; note: string | null; capture_id: string; photo_count: number };

export function paperLogPayload(pick: ReasonPick, capture: { captureId: string; paths: string[] }): PaperLogPayload {
  return {
    reason: pick.label, reason_id: pick.reasonId && !pick.reasonId.startsWith("default-") ? pick.reasonId : null,
    category: pick.category, note: pick.note?.trim() || null, capture_id: capture.captureId, photo_count: capture.paths.length,
  };
}

export const paperLogProblem = (pick: ReasonPick | null): string | null => {
  if (!pick) return "Pick why you're on paper.";
  if (pick.reasonId == null && !pick.note?.trim()) return "Say why.";
  return null;
};

// ── The admin list ──────────────────────────────────────────────────────────────────────────────────────
import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export type PaperLogRow = { event_id: string; user_id: string; occurred_at: string; payload: Partial<PaperLogPayload> };
const day = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };

export function paperLogColumns(nameOf: (id: string) => string): ShellColumn<PaperLogRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => day(r.occurred_at), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.user_id), weight: 1.2 },
    { key: "reason", label: "Reason", get: (r) => [r.payload.reason, r.payload.note].filter(Boolean).join(" · "), weight: 2 },
    { key: "pages", label: "Pages", get: (r) => r.payload.photo_count ?? 0, align: "r", weight: 0.6 },
  ];
}

export function paperLogFilters(nameOf: (id: string) => string): ShellFilter<PaperLogRow>[] {
  return [
    { id: "driver", label: "Driver", of: (r) => r.user_id, show: nameOf },
    { id: "reason", label: "Reason", of: (r) => r.payload.reason ?? "" },
  ];
}
