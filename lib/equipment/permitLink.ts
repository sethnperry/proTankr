// lib/equipment/permitLink.ts
//
// Two document systems grew side by side: the old Equipment Details screen files documents under fixed category
// names ("trailer_registration", "tank_v") and keeps its dates on the unit's own columns; the Binder files them under
// the company's permit types and keeps dates in equipment_permits. These helpers connect the two so a document or a
// date saved in either place is seen by both (and by dispatch, the alerts and the bell, which read the Binder's).
// Pure: matching by the permit type's name.

export type PermitTypeLite = { permit_type_id: string; name: string; applies_to: "truck" | "trailer" | "both" | string; terminal_id?: string | null };
export type UnitKind = "truck" | "trailer";

const PATTERNS: Record<UnitKind, [string, RegExp][]> = {
  truck: [
    ["registration", /^registration$/i], ["annual_inspection", /annual inspection/i], ["ifta", /ifta/i], ["phmsa_hazmat", /phmsa/i],
    ["alliance_hazmat", /alliance/i], ["fleet_insurance", /fleet insurance/i], ["hazmat_lic", /hazmat (transportation )?lic/i], ["inner_bridge", /inner bridge/i],
  ],
  trailer: [
    ["trailer_registration", /^registration$/i], ["annual_inspection", /annual inspection/i], ["tank_v", /^v\b/i], ["tank_k", /^k\b/i], ["tank_l", /^l\b/i],
    ["tank_t", /^t\b/i], ["tank_i", /^i\b/i], ["tank_p", /^p\b/i], ["tank_uc", /^uc\b/i],
  ],
};

/** The old screen's category for a Binder permit type, or null when it has none (a custom permit). */
export function slugForPermit(kind: UnitKind, name: string): string | null {
  for (const [slug, re] of PATTERNS[kind]) if (re.test(name.trim())) return slug;
  return null;
}

/** The Binder permit type for an old category, among the company's types that apply to this kind of unit. */
export function permitTypeForSlug(types: PermitTypeLite[], kind: UnitKind, slug: string): PermitTypeLite | null {
  const re = PATTERNS[kind].find(([s]) => s === slug)?.[1];
  if (!re) return null;
  return types.find((t) => !t.terminal_id && (t.applies_to === kind || t.applies_to === "both") && re.test(t.name.trim())) ?? null;
}
