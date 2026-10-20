"use client";
// lib/queries/useTerminalsCatalog.ts
//
// Shared, cached fetch for the `terminals` table -- the terminals-catalog
// counterpart to useProductsCatalog.ts (same pattern, see that file's own
// header comment for the full rationale). Before this hook existed,
// useTerminals.ts's loadTerminalCatalog() was mounted twice independently
// (CalculatorShellContext.tsx and app/planner/cards/page.tsx, for a
// dispatcher/admin viewing a specific driver), plus 3 more files
// (app/admin/page.tsx, FleetCardsModal.tsx, AdminLoadsModal.tsx) each ran
// their own full-catalog fetch, and app/planner/dispatch/page.tsx did a
// targeted .in(terminalIds) network lookup that's cheaper served from
// this cache instead. See CLAUDE.md's "Performance pass #3" follow-up for
// the full audit.
//
// This fetches the UNION of every column any consumer needs, with NO
// `active` filter -- same "canonical unfiltered, each consumer decides"
// precedent as products. useTerminals.ts's own driver-facing
// terminalCatalog value applies `active !== false` itself (matching its
// exact prior behavior); the admin-facing consumers never filtered and
// still don't.
//
// staleTime is set long (10 min) -- the terminal catalog changes about as
// rarely as the product catalog does.

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { TerminalCatalogRow } from "@/app/planner/types";

export type CatalogTerminal = TerminalCatalogRow & {
  city_id: string | null;
  lat: number | null;
  lon: number | null;
  gauging_cutoff: string | null;
  gauging_minutes: number | null;
};

export const TERMINALS_CATALOG_QUERY_KEY = ["terminalsCatalog"] as const;
const TERMINALS_CATALOG_STALE_TIME = 10 * 60 * 1000;

// PostgREST's server-side max-rows cap (1000, confirmed live, unaffected
// by a plain `.select()` with no `.range()`) means a bare fetch of this
// table silently truncates -- the live catalog is 1,238+ rows (see
// CLAUDE.md's terminal-seeding work). app/admin/page.tsx's own loadAll()
// already found and fixed this exact truncation once (its own comment
// documents it), via paginated fetchAllRows -- but useTerminals.ts's
// driver-facing catalog fetch never got that same fix. Centralizing both
// into one canonical fetch means picking the correct (paginated)
// implementation for everyone, not carrying the truncation bug forward.
const FETCH_PAGE_SIZE = 1000;

export async function fetchTerminalsCatalog(): Promise<CatalogTerminal[]> {
  const all: CatalogTerminal[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("terminals")
      .select("terminal_id, terminal_name, city, state, city_id, timezone, active, renewal_days, lat, lon, gauging_cutoff, gauging_minutes")
      .order("state", { ascending: true })
      .order("city", { ascending: true })
      .order("terminal_name", { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1)
      .returns<CatalogTerminal[]>();
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < FETCH_PAGE_SIZE) break;
    from += FETCH_PAGE_SIZE;
  }
  return all;
}

// Stable across every render -- see useProductsCatalog.ts's identical
// comment for why this matters (a bare `[]` destructuring default
// creates a new array every render while `data` is still undefined,
// which fed through a useMemo -> useCallback -> useEffect chain caused a
// real infinite-loop bug last pass). Applied here from the start, since
// useTerminals.ts feeds this catalog into its own further useMemo/
// useCallback chains (terminalDisplayInfo, its final memoized return).
const EMPTY_CATALOG: CatalogTerminal[] = [];

export function useTerminalsCatalog() {
  const query = useQuery({
    queryKey: TERMINALS_CATALOG_QUERY_KEY,
    queryFn: fetchTerminalsCatalog,
    staleTime: TERMINALS_CATALOG_STALE_TIME,
  });
  return { ...query, data: query.data ?? EMPTY_CATALOG };
}

// For imperative call sites that aren't component render paths (e.g.
// app/admin/page.tsx's loadAll()) -- same reasoning as
// fetchProductsCatalogCached in useProductsCatalog.ts.
export function fetchTerminalsCatalogCached(queryClient: QueryClient): Promise<CatalogTerminal[]> {
  return queryClient.fetchQuery({
    queryKey: TERMINALS_CATALOG_QUERY_KEY,
    queryFn: fetchTerminalsCatalog,
    staleTime: TERMINALS_CATALOG_STALE_TIME,
  });
}
