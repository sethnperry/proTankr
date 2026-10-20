// lib/suppliers/locks.ts
//
// Supplier steps carry one lock flag each (supplier_terminal_steps.step_locks,
// same order as steps). Dispatch locks a step so drivers can't change it.

/** Drops blank steps along with their locks, trims text, and pads/cuts the
 *  locks to match. A blank step can't stay locked. */
export function alignSteps(steps: string[], locks: boolean[]): { steps: string[]; locks: boolean[] } {
  const outSteps: string[] = [];
  const outLocks: boolean[] = [];
  steps.forEach((s, i) => {
    const t = s.trim();
    if (!t) return;
    outSteps.push(t);
    outLocks.push(locks[i] === true);
  });
  return { steps: outSteps, locks: outLocks };
}

/** Whether a non-manager's edit would touch anything locked (the database
 *  refuses it too; this lets the screen say so before saving). */
export function touchesLocked(
  old: { account: string | null; accountLocked: boolean; steps: string[]; locks: boolean[] },
  next: { account: string | null; steps: string[] },
): string | null {
  if (old.accountLocked && (old.account ?? "") !== (next.account ?? "")) return "The account number is locked by dispatch.";
  for (let i = 0; i < old.locks.length; i++) {
    if (old.locks[i] && (old.steps[i] ?? null) !== (next.steps[i] ?? null)) return `Step ${i + 1} is locked by dispatch.`;
  }
  return null;
}
