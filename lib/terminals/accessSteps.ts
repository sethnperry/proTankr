// lib/terminals/accessSteps.ts
//
// Turns a terminal's access requirements and one driver's progress into the
// ordered list of steps the driver works through. Pure, so it can be tested
// without a session.
//
// Order: the company letter goes where the terminal needs it (up front, just
// before the check load, or just before the card is issued); then the
// training video or PowerPoint, registering on the terminal's website, the
// onsite orientation, the training loads, the check load (the last required
// load, with an operator), and the card issued.
//
// Steps can be done out of order: "next" is just the first one not done.
// The check load is "blocked" while a letter that's due before it is
// missing, and so is the card when its letter is missing.

import type { QualStep, QualStepState } from "./qualification.ts";

export type LetterDue = "before_first_load" | "before_check_load" | "before_card" | "unknown";

export type AccessRequirements = {
  terminal_id: string;
  training_loads_required: number | null;
  has_training_media: boolean | null;
  training_media_url: string | null;
  new_user_url: string | null;
  letter_required: boolean | null;
  letter_due: LetterDue | null;
  has_orientation: boolean | null;
  orientation_schedule: string | null;
  notes: string | null;
  extra_steps?: { id: string; label: string }[] | null;
  updated_at?: string | null;
};

export type AccessProgress = {
  id: string;
  terminal_id: string;
  started_at: string;
  letter_id: string | null;
  letter_attached_at: string | null;
  media_done_at: string | null;
  registered_at: string | null;
  orientation_done_at: string | null;
  loads_adjust: number;
  extras_done?: Record<string, string> | null;
  card_issued_at: string | null;
  completed_at: string | null;
};

export type AccessStepKey = "letter" | "media" | "register" | "orientation" | `extra:${string}` | `load:${number}` | "card";

export type AccessStep = QualStep & { key: AccessStepKey };

// Questions a terminal still needs answered before its steps are known.
export function requirementsComplete(r: AccessRequirements | null | undefined): boolean {
  if (!r) return false;
  return r.training_loads_required != null && r.has_training_media != null
    && r.letter_required != null && r.has_orientation != null;
}

export function accessSteps(
  req: AccessRequirements | null | undefined,
  prog: AccessProgress | null | undefined,
  loadsCompleted: number,
): AccessStep[] {
  const loadsRequired = Math.max(1, Number(req?.training_loads_required ?? 1) || 1);
  const loadsDone = Math.max(0, loadsCompleted + Number(prog?.loads_adjust ?? 0));
  const letterNeeded = req?.letter_required !== false;
  const letterDue: LetterDue = req?.letter_due ?? "unknown";
  const letterDone = !!prog?.letter_attached_at;

  type Raw = { key: AccessStepKey; kind: QualStep["kind"]; label: string; done: boolean };
  const raw: Raw[] = [];
  const letter: Raw = { key: "letter", kind: "letter", label: "Company authorization letter", done: letterDone };
  if (letterNeeded && (letterDue === "before_first_load" || letterDue === "unknown")) raw.push(letter);
  if (req?.has_training_media) raw.push({ key: "media", kind: "video", label: "Training video or PowerPoint", done: !!prog?.media_done_at });
  if (req?.new_user_url) raw.push({ key: "register", kind: "register", label: "Register as a new user", done: !!prog?.registered_at });
  if (req?.has_orientation) raw.push({ key: "orientation", kind: "orientation", label: "Onsite orientation", done: !!prog?.orientation_done_at });
  for (const x of req?.extra_steps ?? []) {
    if (x?.id && x.label) raw.push({ key: `extra:${x.id}`, kind: "other", label: x.label, done: !!prog?.extras_done?.[x.id] });
  }
  for (let i = 1; i < loadsRequired; i++) {
    raw.push({ key: `load:${i}`, kind: "training_load", label: `Training load ${i}`, done: loadsDone >= i });
  }
  if (letterNeeded && letterDue === "before_check_load") raw.push(letter);
  raw.push({ key: `load:${loadsRequired}`, kind: "check_load", label: "Check load with an operator", done: loadsDone >= loadsRequired });
  if (letterNeeded && letterDue === "before_card") raw.push(letter);
  raw.push({ key: "card", kind: "card", label: "Card issued", done: !!prog?.card_issued_at });

  const firstOpen = raw.findIndex((r) => !r.done);
  return raw.map((r, i) => {
    let state: QualStepState = r.done ? "done" : i === firstOpen ? "next" : "pending";
    const letterMissing = letterNeeded && !letterDone;
    if (!r.done && letterMissing && r.kind === "check_load" && letterDue === "before_check_load") state = "blocked";
    if (!r.done && letterMissing && r.kind === "card" && letterDue === "before_card") state = "blocked";
    return { key: r.key, kind: r.kind, label: r.label, state };
  });
}

// Number of training loads (including the check load) done so far.
export function loadsDone(prog: AccessProgress | null | undefined, loadsCompleted: number): number {
  return Math.max(0, loadsCompleted + Number(prog?.loads_adjust ?? 0));
}

// In progress = started and the card isn't issued yet.
export const inProgress = (p: AccessProgress | null | undefined) => !!p && !p.completed_at;
