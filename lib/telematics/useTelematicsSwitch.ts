"use client";
// lib/telematics/useTelematicsSwitch.ts
//
// Reads the company's telematics switch once (cached ten minutes) and sets the module flag in switch.ts, so every
// tfetch call stops at the source when the company has it off, or has no connection at all. Mounted once per shell
// (the planner layout and the company dashboard). Until the answer arrives the flag stays on: nothing changes.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { setTelematicsOn } from "./switch";

export function useTelematicsSwitch(companyId: string | null): void {
  const q = useQuery({
    queryKey: ["telematicsSwitch", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: async (): Promise<boolean | null> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const r = await fetch(`/api/telematics/status?companyId=${encodeURIComponent(companyId!)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) return null; // unknown: leave the flag as it is
      const j = (await r.json()) as { connected?: boolean; enabled?: boolean };
      return !!j.connected && j.enabled !== false;
    },
  });
  useEffect(() => { if (q.data != null) setTelematicsOn(q.data); }, [q.data]);
  useEffect(() => { setTelematicsOn(true); }, [companyId]); // a different company: unknown again until its answer
}
