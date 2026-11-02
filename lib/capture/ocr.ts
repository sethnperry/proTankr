// lib/capture/ocr.ts
//
// Reading a receipt photo: what we ask the reader for, and how its answer becomes OcrFields. Pure. The reader's
// answer is only ever a suggestion the driver confirms, so anything that doesn't look like fuel is dropped
// instead of guessed at.

import type { OcrFields } from "./capture.ts";

export const RECEIPT_PROMPT =
  'This is a photo of a truck-stop fuel receipt. Reply with ONLY a JSON object: {"station": string|null, "gallons": number|null, "amount": number|null, "date": "YYYY-MM-DD"|null}. ' +
  '"gallons" is the DIESEL gallons only (not DEF), "amount" is the receipt total in dollars. Use null for anything you cannot read clearly. No other text.';

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function parseReceiptReply(text: string): OcrFields | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: any;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const gallons = num(o.gallons);
  const amount = num(o.amount);
  const station = typeof o.station === "string" && o.station.trim() ? o.station.trim().slice(0, 80) : null;
  const date = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : null;
  const out: OcrFields = {
    station,
    gallons: gallons != null && gallons > 0 && gallons <= 500 ? Math.round(gallons * 1000) / 1000 : null,
    amount: amount != null && amount > 0 && amount <= 5000 ? Math.round(amount * 100) / 100 : null,
    date,
  };
  return out.station || out.gallons || out.amount ? out : null;
}
