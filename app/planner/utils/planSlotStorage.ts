"use client";
// app/planner/utils/planSlotStorage.ts
//
// Pure helpers for saved plans: parsing a stored payload, comparing save times, and
// checking whether a snapshot holds a real product selection. No React, no storage access.

export const PLAN_SLOTS = [1, 2, 3, 4, 5] as const;

// ─── Payload parse (back-compat) ──────────────────────────────────────────────

export function parsePlanPayload(raw: string | null, fallbackTerminalId: string, fallbackComboId: string): any {
  if (!raw) return null;
  try {
    const obj: any = JSON.parse(raw);
    // Real bug found while chasing an activeSlot/compPlan desync: this
    // function's own "is this legacy?" check was `obj.version == null` --
    // but the CURRENT format (buildSnapshot's own shape) has never had a
    // `version` field at all, only `v` (a different key). That check was
    // therefore true for every single current-format payload, silently
    // routing every one of them through the "legacy" reconstruction below
    // -- which only ever copies a fixed, old field list (terminalId/
    // tempF/cgSlider/compPlan) and drops anything else, including `v`,
    // `savedAt`, `name`, and this session's new `activeSlot`. This is the
    // ONE function both the local<->server sync pull AND the server
    // upload path go through, so it silently stripped those fields on
    // every cross-device round trip, independent of anything else. A
    // current-format object (`v: 1`) is already well-formed -- pass it
    // through as-is so every field, known or added later, survives.
    if (obj && typeof obj === "object" && obj.v === 1) {
      return obj;
    }
    if (obj && typeof obj === "object" && obj.version == null) {
      return {
        version: 0,
        savedAtISO: "",
        terminalId: fallbackTerminalId,
        comboId: fallbackComboId,
        tempF: typeof obj.tempF === "number" ? obj.tempF : undefined,
        cgSlider: typeof obj.cgSlider === "number" ? obj.cgSlider : undefined,
        compPlan: obj.compPlan ?? undefined,
      };
    }
    return obj;
  } catch {
    return null;
  }
}

export function compareSavedAt(a: any, b: any): number {
  // Real bug found while chasing the same activeSlot/compPlan desync as
  // parsePlanPayload's own fix above: this only ever compared the LEGACY
  // `savedAtISO` field. buildSnapshot (the only thing that writes local
  // OR uploads to the server today) has never set that field -- it sets
  // `savedAt`, a real numeric ms timestamp -- so both sides of this
  // comparison were silently always 0 for every current-format payload,
  // regardless of which one was actually more recent. That made
  // pullInto's "is the server's copy actually newer" check pure noise:
  // it could only ever return 0 (never > 0), so a server-side slot 0 row
  // could never lose an overwrite decision on its own merits, only via
  // the separate `!localHasRealContent` escape hatch. `savedAt` (numeric)
  // is preferred on both sides now, with `savedAtISO` kept only as a
  // fallback for genuinely old-format data that predates `savedAt`
  // existing at all.
  const at = typeof a?.savedAt === "number" ? a.savedAt : a?.savedAtISO ? Date.parse(String(a.savedAtISO)) : 0;
  const bt = typeof b?.savedAt === "number" ? b.savedAt : b?.savedAtISO ? Date.parse(String(b.savedAtISO)) : 0;
  return at - bt;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Sentinel scope used for every plan slot (0 through 5) so they're stored
// terminal-independent -- user_plan_slots.terminal_id/combo_id are NOT NULL
// text and part of the unique key, so a constant, non-null value here needs
// no schema migration and dedupes correctly (unlike NULL, which Postgres
// never treats as equal to itself for uniqueness). Originally only slots
// 1-5 (named presets) used this; slot 0 (the "live"/autosave plan) joined
// them 2026-08-27 ("one setup persists across all terminals" -- see
// planScopeKey's own comment below for the full story).
export const UNIVERSAL_SCOPE = "__universal__";

// "Has real content" rather than "has a record at all" -- a slot that's
// been explicitly cleared (see clearSlot) still has a record (an empty
// marker, so the legacy fallback doesn't leak through) but should read as
// unset for the dial's own has-data indicator.
export function snapshotHasContent(snap: any): boolean {
  if (!snap || snap.v !== 1 || !snap.compPlan || typeof snap.compPlan !== "object") return false;
  return Object.values(snap.compPlan).some((v: any) => v && !v.empty && v.productId);
}

// Same "does this have a real product selection" check, but for objects
// coming out of parsePlanPayload -- which normalizes a locally-written
// { v: 1, ... } entry into a DIFFERENT shape ({ version: 0, ... }, no `v`
// field at all). snapshotHasContent's `snap.v !== 1` guard would reject
// every one of those unconditionally, which isn't what "does the local
// cache have real content" should mean here -- only compPlan itself
// matters for this check.
export function hasRealCompPlan(obj: any): boolean {
  const cp = obj?.compPlan;
  if (!cp || typeof cp !== "object") return false;
  return Object.values(cp).some((v: any) => v && !(v as any).empty && (v as any).productId);
}
