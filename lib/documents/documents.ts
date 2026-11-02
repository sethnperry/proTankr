// lib/documents/documents.ts
//
// Document drop and down time. Both are shift events with photos behind them (the capture sheet's form_captures
// row). A document has a type from a dropdown; down time is camera only: no approval, no timer, no form. Pure:
// the types, the event payloads and the admin list's columns and filters.

import type { ShellColumn, ShellFilter } from "../reports/reportShell.ts";

export const DOCUMENT_EVENT = "document_drop";
export const DOWN_TIME_EVENT = "down_time";

export const DOCUMENT_TYPES = [
  { value: "bol", label: "Bill of lading" },
  { value: "scale_ticket", label: "Scale ticket" },
  { value: "inspection", label: "Inspection report" },
  { value: "accident", label: "Accident or incident report" },
  { value: "repair_invoice", label: "Repair invoice" },
  { value: "receipt", label: "Receipt" },
  { value: "certificate", label: "Training or safety certificate" },
  { value: "other", label: "Other" },
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

export const typeLabel = (v: string | null | undefined): string => DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? (v ? v : "");

export type DocumentPayload = { doc_type: DocumentType; note: string | null; capture_id: string; photo_count: number };

export function documentProblem(type: string, note: string): string | null {
  if (!DOCUMENT_TYPES.some((t) => t.value === type)) return "Pick the kind of document.";
  if (type === "other" && !note.trim()) return "Say what the document is.";
  return null;
}

export const documentPayload = (type: DocumentType, note: string, c: { captureId: string; paths: string[] }): DocumentPayload =>
  ({ doc_type: type, note: note.trim() || null, capture_id: c.captureId, photo_count: c.paths.length });

export type DownTimePayload = { capture_id: string; photo_count: number };
export const downTimePayload = (c: { captureId: string; paths: string[] }): DownTimePayload => ({ capture_id: c.captureId, photo_count: c.paths.length });

// ── The admin list: dropped documents and down time together, filterable by type ─────────────────────────────
export type DocumentRow = { event_id: string; user_id: string; event_type: string; occurred_at: string; payload: Partial<DocumentPayload & DownTimePayload> };
const day = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`; };
/** What the row is: the document's type, or "Down time". */
export const rowType = (r: DocumentRow): string => (r.event_type === DOWN_TIME_EVENT ? "down_time" : r.payload.doc_type ?? "other");
export const rowTypeLabel = (v: string) => (v === "down_time" ? "Down time" : typeLabel(v));

export function documentColumns(nameOf: (id: string) => string): ShellColumn<DocumentRow>[] {
  return [
    { key: "date", label: "Date", get: (r) => day(r.occurred_at), weight: 0.8 },
    { key: "driver", label: "Driver", get: (r) => nameOf(r.user_id), weight: 1.2 },
    { key: "type", label: "Type", get: (r) => rowTypeLabel(rowType(r)), weight: 1.4 },
    { key: "note", label: "Note", get: (r) => r.payload.note ?? "", weight: 1.2 },
    { key: "photos", label: "Photos", get: (r) => r.payload.photo_count ?? 0, align: "r", weight: 0.6 },
  ];
}

export function documentFilters(nameOf: (id: string) => string): ShellFilter<DocumentRow>[] {
  return [
    { id: "type", label: "Type", of: rowType, show: rowTypeLabel },
    { id: "driver", label: "Driver", of: (r) => r.user_id, show: nameOf },
  ];
}
