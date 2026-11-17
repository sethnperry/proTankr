"use client";
// app/planner/hooks/useGeotabEquipment.ts
//
// What Geotab says about THIS driver's truck right now, polled every three minutes while the dashboard is open (the
// server shares Geotab answers between everyone, so this is cheap), plus the driver's own second-seat row.

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { GeoMine } from "@/lib/equipment/geotabMatch";

export function useGeotabEquipment(userId: string | null, enabled = true) {
  const qc = useQueryClient();
  const key = ["geotabMine", userId];
  const q = useQuery({
    queryKey: key, enabled: !!userId && enabled, staleTime: 2 * 60_000, refetchInterval: 3 * 60_000, refetchOnWindowFocus: true, retry: 0,
    queryFn: async (): Promise<GeoMine | null> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return null;
      const r = await fetch("/api/telematics/my-equipment", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      return r.ok ? ((await r.json()) as GeoMine) : null;
    },
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { geo: q.data ?? null, refresh };
}

export type SecondSeat = { truckId: string; truckName: string | null; driverName: string | null } | null;

/** The truck this driver is attached to in the second seat (or null), and who is driving it. */
export function useSecondSeat(userId: string | null) {
  const qc = useQueryClient();
  const key = ["secondSeat", userId];
  const q = useQuery({
    queryKey: key, enabled: !!userId, staleTime: 60_000, refetchInterval: 3 * 60_000,
    queryFn: async (): Promise<SecondSeat> => {
      const { data } = await supabase.from("second_seats").select("truck_id").eq("user_id", userId!).maybeSingle();
      const truckId = (data as { truck_id?: string } | null)?.truck_id;
      if (!truckId) return null;
      const [{ data: t }, { data: h }] = await Promise.all([
        supabase.from("trucks").select("truck_name").eq("truck_id", truckId).maybeSingle(),
        supabase.from("user_settings").select("user_id").eq("current_truck_id", truckId).limit(1),
      ]);
      const holder = ((h ?? []) as { user_id: string }[])[0]?.user_id;
      let driverName: string | null = null;
      if (holder) { const { data: nm } = await supabase.rpc("get_display_names_full", { p_user_ids: [holder] }); driverName = ((nm ?? []) as { display_name: string | null }[])[0]?.display_name ?? null; }
      return { truckId, truckName: (t as { truck_name?: string } | null)?.truck_name ?? null, driverName };
    },
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [busy, setBusy] = useState(false);
  const leave = useCallback(async () => { setBusy(true); await supabase.rpc("leave_second_seat"); await refresh(); setBusy(false); }, [refresh]);
  return { seat: q.data ?? null, refresh, leave, busy };
}
