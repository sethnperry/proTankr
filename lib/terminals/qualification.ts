// lib/terminals/qualification.ts
//
// Shape and summary for a terminal-qualification strip: the steps a driver
// works through before a terminal issues access (company letter, training
// video, orientation, training loads, a final check load).
//
// Real steps come from lib/terminals/accessSteps.ts (terminal requirements +
// the driver's progress).

export type QualStepKind = "letter" | "video" | "register" | "orientation" | "training_load" | "check_load" | "card" | "other";
export type QualStepState = "done" | "next" | "pending" | "blocked";

export type QualStep = { kind: QualStepKind; label: string; state: QualStepState };

export type QualSummary = {
  done: number;
  total: number;
  loadsDone: number;
  loadsTotal: number;
  next: QualStep | null;
  blocked: QualStep | null;
  complete: boolean;
};

export const QUAL_KIND_MARK: Record<QualStepKind, string> = {
  letter: "L",
  video: "V",
  orientation: "O",
  training_load: "T",
  check_load: "C",
  register: "R",
  card: "★",
  other: "•",
};

export function summarizeQualification(steps: QualStep[]): QualSummary {
  const loads = steps.filter((s) => s.kind === "training_load");
  const done = steps.filter((s) => s.state === "done").length;
  return {
    done,
    total: steps.length,
    loadsDone: loads.filter((s) => s.state === "done").length,
    loadsTotal: loads.length,
    next: steps.find((s) => s.state === "next") ?? steps.find((s) => s.state === "pending") ?? null,
    blocked: steps.find((s) => s.state === "blocked") ?? null,
    complete: steps.length > 0 && done === steps.length,
  };
}

// What to draw when there are too many steps to fit: completed steps before
// the first open one collapse into one "done" block, so open steps never
// shrink. Returns the steps to draw plus how many were folded.
export function compactSteps(steps: QualStep[], maxSegments: number): { folded: number; steps: QualStep[] } {
  if (steps.length <= maxSegments) return { folded: 0, steps };
  const firstOpen = steps.findIndex((s) => s.state !== "done");
  if (firstOpen <= 0) return { folded: 0, steps };
  // Fold leading done steps, keeping at most one visible so progress reads.
  const fold = Math.min(firstOpen - 1, steps.length - maxSegments + 1);
  if (fold <= 1) return { folded: 0, steps };
  return { folded: fold, steps: steps.slice(fold) };
}
