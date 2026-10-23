"use client";
// lib/queries/useProductsCatalog.ts
//
// Shared, cached fetch for the `products` table. Before this hook
// existed, 7 independent files each issued their own
// supabase.from("products") query with a slightly different column set
// -- app/admin/page.tsx, IncentiveSettingsModal.tsx (since deleted),
// PayrollReportModal.tsx (no longer a consumer -- rebuilt on
// load_utilization), ManageTerminalProductsModal.tsx,
// EditTerminalModal.tsx (Terminal tab), terminal/page.tsx, and
// useTerminalOutageReports.ts (which refetched on every 90s poll tick).
// See CLAUDE.md's "Performance pass #3" for the full audit.
//
// This fetches the UNION of every column any of those 7 sites needs, with
// NO `active` filter and NO id-list filter -- the full catalog, once,
// cached. Each consumer applies its own filter/lookup client-side (e.g.
// admin/page.tsx's old `.eq("active", true)` becomes
// `.filter(p => p.active)` after reading from this hook). Safe because
// products is a small reference table -- one full-catalog fetch sliced in
// memory is cheaper and simpler than N independently-filtered network
// round trips, and every prior caller already tolerated getting back
// more columns than it strictly used.
//
// staleTime is set long (10 min) because this is genuinely near-static
// data -- a company's product catalog changes rarely, not every session.
// Any consumer that mutates products (there are none client-side today;
// product rows are managed at the DB/seed level, not through app UI)
// would need to call queryClient.invalidateQueries({ queryKey:
// PRODUCTS_CATALOG_QUERY_KEY }) after the mutation -- flagging this here
// so it isn't forgotten if that ever changes.

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type CatalogProduct = {
  product_id: string;
  product_name: string;
  display_name: string | null;
  button_code: string | null;
  hex_code: string | null;
  description: string | null;
  un_number: string | null;
  active: boolean;
  is_dyed: boolean | null;
  api_60: number | null;
  alpha_per_f: number | null;
  canonical_product_id: string | null;
  // Published API range; api_min (heaviest) is what the Planner uses at 60 F
  // when there is no terminal reading (Plan Builder / Plan page).
  api_min: number | null;
  api_max: number | null;
};

export const PRODUCTS_CATALOG_QUERY_KEY = ["productsCatalog"] as const;
const PRODUCTS_CATALOG_STALE_TIME = 10 * 60 * 1000;

export async function fetchProductsCatalog(): Promise<CatalogProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "product_id, product_name, display_name, button_code, hex_code, description, un_number, active, is_dyed, api_60, alpha_per_f, canonical_product_id, api_min, api_max"
    )
    .order("product_name");
  if (error) throw error;
  return (data ?? []) as CatalogProduct[];
}

// Stable across every render (module scope, created once) -- the
// fallback for `data` before the catalog has loaded. This matters more
// here than a typical "loading" default: several consumers (see
// useTerminalOutageReports.ts) feed `data` into a useMemo -> useCallback
// -> useEffect chain. `const { data: x = [] } = useProductsCatalog()`
// looks harmless but a bare `[]` default is a NEW array literal on every
// render while `data` is still undefined -- that breaks referential
// stability all the way up the chain, which turned a stale-but-harmless
// re-render into a real infinite-loop bug (React's "Maximum update depth
// exceeded") in useTerminalOutageReports.ts specifically, caught during
// this pass's own live verification. Returning this same stable
// reference from the hook itself (instead of leaving it to each
// consumer's own destructuring default) fixes it at the source for every
// consumer at once, including ones not yet written.
const EMPTY_CATALOG: CatalogProduct[] = [];

export function useProductsCatalog() {
  const query = useQuery({
    queryKey: PRODUCTS_CATALOG_QUERY_KEY,
    queryFn: fetchProductsCatalog,
    staleTime: PRODUCTS_CATALOG_STALE_TIME,
  });
  return { ...query, data: query.data ?? EMPTY_CATALOG };
}

// For imperative call sites that aren't component render paths (e.g.
// app/admin/page.tsx's loadAll(), a plain async function that can't call
// a hook) -- goes through the same cache/queryKey/staleTime as
// useProductsCatalog() above via QueryClient.fetchQuery, which returns
// the cached value immediately if still fresh, or fetches and caches it
// otherwise. Callers get a real QueryClient via useQueryClient() in their
// component body and pass it in here.
export function fetchProductsCatalogCached(queryClient: QueryClient): Promise<CatalogProduct[]> {
  return queryClient.fetchQuery({
    queryKey: PRODUCTS_CATALOG_QUERY_KEY,
    queryFn: fetchProductsCatalog,
    staleTime: PRODUCTS_CATALOG_STALE_TIME,
  });
}
