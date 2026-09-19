// lib/ui/driver/normalizePlaceName.ts
//
// Mirrors the DB's own public.normalize_place_name() exactly (see
// supabase/migrations/20260923000000_dedupe_regions_local_areas.sql,
// verified against a real throwaway Postgres before being handed over) --
// lowercase, strip all punctuation/whitespace, expand only three
// well-established, unambiguous US place-name abbreviations (Ft->Fort,
// St->Saint, Mt->Mount) as whole words. Not single-letter N/S/E/W (too
// easy to false-positive on unrelated text) and not a broader guess at
// every conceivable abbreviation.
//
// Pure, JSX-free module (unlike RequiredEquipmentFields.tsx, which
// re-exports this) so it can be imported directly by
// normalizePlaceName.test.ts under this project's zero-dependency
// node:test runner -- that runner strips TypeScript types but doesn't
// transform JSX, so a function living inside a real .tsx component file
// can't be imported by a plain test file at all.
export function normalizePlaceName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\bft\b/g, "fort")
    .replace(/\bst\b/g, "saint")
    .replace(/\bmt\b/g, "mount")
    .replace(/[^a-z0-9]+/g, "");
}
