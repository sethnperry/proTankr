"use client";
// lib/telematics/useGeotabLink.ts
//
// The URL for "Track in Geotab" (null when the company has no Geotab connection). One small read of our own tables,
// cached for half an hour: it never calls Geotab.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export function useGeotabLink(companyId: string | null, truckId: string | null, enabled = true): string | null {
  const q = useQuery({
    queryKey: ["geotabLink", companyId, truckId],
    enabled: !!companyId && enabled,
    staleTime: 30 * 60_000,
    retry: 0,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const p = new URLSearchParams({ companyId: companyId! });
      if (truckId) p.set("truckId", truckId);
      const r = await fetch(`/api/telematics/geotab-link?${p}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      return r.ok ? ((await r.json()) as { url: string | null }).url : null;
    },
  });
  return q.data ?? null;
}
