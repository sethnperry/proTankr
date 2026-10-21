// lib/telematics/groups.ts
//
// Turns the provider's group tree into readable paths ("Southeast › Tampa") and counts what sits in
// each. Pure. Geotab's built-in top groups (ids like GroupCompanyId) aren't something a fleet named,
// so they're left out of the path; a unit only in those reads as "Whole company".

import type { ProviderGroup } from "./types";

const SYSTEM = /^Group[A-Za-z]*Id$/;
export const WHOLE_COMPANY = "Whole company";

export function groupPath(id: string, byId: Map<string, ProviderGroup>): string {
  const chain: string[] = [];
  const seen = new Set<string>();
  for (let cur: ProviderGroup | undefined = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    if (!SYSTEM.test(cur.id)) chain.unshift(cur.name);
  }
  return chain.length ? chain.join(" › ") : WHOLE_COMPANY;
}

/** The groups one unit sits in, sorted, "Whole company" only when it has nothing better. */
export function groupNames(ids: string[] | undefined, groups: ProviderGroup[] | Map<string, ProviderGroup>): string[] {
  const byId = groups instanceof Map ? groups : new Map(groups.map((g) => [g.id, g]));
  const all = [...new Set((ids ?? []).map((i) => groupPath(i, byId)))];
  const named = all.filter((p) => p !== WHOLE_COMPANY).sort();
  return named.length ? named : [WHOLE_COMPANY];
}

/** Same, joined for display. */
export function pathsFor(ids: string[] | undefined, groups: ProviderGroup[] | Map<string, ProviderGroup>): string {
  return groupNames(ids, groups).join(", ");
}

export type GroupRow = { path: string; trucks: string[]; trailers: string[] };

export function summarizeGroups(
  groups: ProviderGroup[],
  trucks: { name: string; groupIds?: string[] }[],
  trailers: { name: string; groupIds?: string[] }[],
): GroupRow[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const rows = new Map<string, GroupRow>();
  const add = (kind: "trucks" | "trailers", name: string, ids?: string[]) => {
    const paths = ids?.length ? [...new Set(ids.map((i) => groupPath(i, byId)))] : [WHOLE_COMPANY];
    for (const path of paths) {
      const r = rows.get(path) ?? { path, trucks: [], trailers: [] };
      r[kind].push(name);
      rows.set(path, r);
    }
  };
  for (const t of trucks) add("trucks", t.name, t.groupIds);
  for (const t of trailers) add("trailers", t.name, t.groupIds);
  return [...rows.values()].sort((a, b) => a.path.localeCompare(b.path));
}
