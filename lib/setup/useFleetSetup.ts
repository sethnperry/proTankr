"use client";
// lib/setup/useFleetSetup.ts — the admin's setup progress for every driver, loaded when the roster opens.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { summarizeFleet, type FleetPayload, type FleetRow } from "./fleetSetup";

export function useFleetSetup(companyId: string | null | undefined, enabled: boolean) {
  const [payload, setPayload] = useState<FleetPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error: e } = await supabase.rpc("company_setup_status", { p_company_id: companyId });
    setLoading(false);
    if (e) return setError(e.message);
    setError(null);
    setPayload(data as FleetPayload);
  }, [companyId]);

  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);

  const rows: FleetRow[] = useMemo(() => summarizeFleet(payload), [payload]);
  const byUser = useMemo(() => new Map(rows.map((r) => [r.userId, r])), [rows]);
  return { rows, byUser, loading, error, reload };
}
