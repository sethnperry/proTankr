// lib/terminals/training.ts
//
// Terminal training that has to be repeated (an online course due every year, say). Separate from the
// card's renewal period and from the one-time access steps. A terminal says what it asks for; each driver
// has the date their training lapses. Pure.

import { daysUntilIso, expiryStateFor, type ExpiryState } from "../expiry.ts";

export type TrainingMode = "online" | "video" | "in_person" | "other";

export const TRAINING_MODES: { id: TrainingMode; label: string }[] = [
  { id: "online", label: "Online course" },
  { id: "video", label: "Video or PowerPoint" },
  { id: "in_person", label: "In person" },
  { id: "other", label: "Other" },
];
export const trainingModeLabel = (m: string | null | undefined) => TRAINING_MODES.find((x) => x.id === m)?.label ?? "Training";

export type TrainingReq = {
  terminal_id: string;
  required: boolean;
  mode: TrainingMode | null;
  url: string | null;
  instructions: string | null;
  renewal_months: number | null;
};
export type TrainingRecord = { completed_at: string | null; expires_at: string | null };

/** ISO date plus whole months, clamped to the end of a short month (Jan 31 + 1 month = Feb 28). */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** When training lapses after finishing it on `completedIso`; null when the terminal gives no renewal period. */
export function expiresAfterCompletion(completedIso: string, renewalMonths: number | null | undefined): string | null {
  return renewalMonths && renewalMonths > 0 ? addMonthsIso(completedIso, renewalMonths) : null;
}

export type TrainingStatus = { state: ExpiryState | "none"; days: number | null; text: string };

/** One driver at one terminal. "none" = the terminal asks for no training. */
export function trainingStatus(req: TrainingReq | null | undefined, rec: TrainingRecord | null | undefined, todayIso?: string): TrainingStatus {
  if (!req || !req.required) return { state: "none", days: null, text: "No training required" };
  if (!rec?.expires_at) return { state: "not_set", days: null, text: rec?.completed_at ? "Completed, no expiration set" : "Not on file" };
  const days = daysUntilIso(rec.expires_at, todayIso);
  const state = expiryStateFor(rec.expires_at, { todayIso });
  const text = days == null ? "" : days < 0 ? `Expired ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "Expires today" : `${days} day${days === 1 ? "" : "s"} left`;
  return { state, days, text };
}
