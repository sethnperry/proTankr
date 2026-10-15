"use client";
// lib/fuel/useFuelSetup.ts
//
// The company's fuel settings and payment methods (what the admin set up).
// Fails open: a missing row means the defaults and no methods.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_FUEL_SETTINGS, GUIDE_BUCKET, type FuelMethod, type FuelSettings } from "./types";

export function useFuelSetup(companyId: string | null | undefined, refreshKey?: unknown) {
  const [settings, setSettings] = useState<FuelSettings | null>(null);
  const [methods, setMethods] = useState<FuelMethod[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!companyId) { setSettings(null); setMethods([]); return; }
    setLoading(true);
    const [s, m] = await Promise.all([
      supabase.from("fuel_settings").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("fuel_payment_methods").select("*").eq("company_id", companyId).order("sort").order("name"),
    ]);
    setSettings({ company_id: companyId, ...DEFAULT_FUEL_SETTINGS, ...((s.data as Partial<FuelSettings>) ?? {}) });
    setMethods(((m.data ?? []) as FuelMethod[]).map((x) => ({ ...x, steps: x.steps ?? [] })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);

  return { settings, methods, loading, reload };
}

// Opens a stored guide (image or PDF) in a new tab via a short-lived link.
export async function openStoredFile(bucket: string, path: string) {
  const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
  if (error || !data?.signedUrl) { w?.close(); throw error ?? new Error("Couldn't open the file"); }
  if (w) w.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}

export const openGuide = (path: string) => openStoredFile(GUIDE_BUCKET, path);
