"use client";
// lib/telematics/useTelematicsLink.ts
//
// Does this company have a telematics connection, which one, and is this truck linked to a
// vehicle in it? The equipment pop-out uses it to decide whether to show the link. Cached per
// company/truck for the session so reopening a pop-out doesn't ask again.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type TelematicsLinkInfo = { connected: boolean; provider: string; providerName: string; linked: boolean; isAdmin: boolean };
const cache = new Map<string, TelematicsLinkInfo>();

export function useTelematicsLink(companyId: string | null, truckId: string | null): TelematicsLinkInfo | null {
  const key = companyId && truckId ? `${companyId}:${truckId}` : null;
  const [info, setInfo] = useState<TelematicsLinkInfo | null>(key ? cache.get(key) ?? null : null);
  useEffect(() => {
    if (!key || !companyId || !truckId) { setInfo(null); return; }
    const hit = cache.get(key);
    if (hit) { setInfo(hit); return; }
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch(`/api/telematics/status?companyId=${encodeURIComponent(companyId)}&truckId=${encodeURIComponent(truckId)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        const v: TelematicsLinkInfo = j?.connected ? { connected: true, provider: j.provider, providerName: j.providerName, linked: !!j.linked, isAdmin: !!j.isAdmin } : { connected: false, provider: "", providerName: "", linked: false, isAdmin: false };
        cache.set(key, v);
        if (alive) setInfo(v);
      } catch { /* fail open: no link */ }
    })();
    return () => { alive = false; };
  }, [key, companyId, truckId]);
  return info;
}
