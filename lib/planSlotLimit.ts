// lib/planSlotLimit.ts
//
// Saved plans are lettered A to Z (slots 1 to 26). They fill in order with no empty plan between two filled ones:
// a new plan takes the lowest free slot, and clearing one closes the gap behind it.

export const MAX_PLAN_SLOTS = 26;
export const PLAN_SLOT_NUMBERS: readonly number[] = Array.from({ length: MAX_PLAN_SLOTS }, (_, i) => i + 1);
