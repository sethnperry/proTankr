"use client";
// lib/standby/useStandby.ts
//
// Standby data: a driver's own signups (with where they stand on each market list), the dispatcher's markets, and
// every driver's signups for the Standby board. Cached with React Query; any write refreshes the lot.

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { DriverLite, MarketLite, SignupLite } from "./coverage";

export type MySignup = SignupLite & { note: string | null; positions: { market_id: string; market_name: string; position: number; total: number; required: number }[] };
const KEY = ["standby"] as const;

export function useMyStandby(userId: string | null, companyId: string | null, enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...KEY, "mine", userId, companyId], enabled: !!userId && !!companyId && enabled, staleTime: 20_000, retry: 0,
    queryFn: async (): Promise<MySignup[]> => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data, error } = await supabase.from("standby_signups").select("signup_id,user_id,start_at,end_at,note,withdrawn_at")
        .eq("user_id", userId!).is("withdrawn_at", null).gt("end_at", since).order("start_at");
      if (error) return [];
      const rows = (data ?? []) as Omit<MySignup, "positions">[];
      return Promise.all(rows.map(async (r) => {
        const { data: pos } = await supabase.rpc("standby_positions", { p_signup_id: r.signup_id });
        return { ...r, positions: ((pos ?? []) as any[]).map((p) => ({ market_id: p.market_id, market_name: p.market_name, position: Number(p.position), total: Number(p.total), required: Number(p.required) })) };
      }));
    },
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: KEY }), [qc]);
  const add = useCallback(async (startMs: number, endMs: number, note?: string): Promise<string | null> => {
    if (!userId || !companyId) return "Not signed in.";
    const { error } = await supabase.from("standby_signups").insert({ company_id: companyId, user_id: userId, start_at: new Date(startMs).toISOString(), end_at: new Date(endMs).toISOString(), note: note?.trim() || null });
    if (error) return error.message;
    await refresh();
    return null;
  }, [userId, companyId, refresh]);
  const withdraw = useCallback(async (signupId: string): Promise<string | null> => {
    const { error } = await supabase.from("standby_signups").update({ withdrawn_at: new Date().toISOString() }).eq("signup_id", signupId);
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh]);
  return { signups: q.data ?? [], loading: q.isLoading, add, withdraw, refresh };
}

export function useStandbyMarkets(companyId: string | null, enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...KEY, "markets", companyId], enabled: !!companyId && enabled, staleTime: 30_000, retry: 0,
    queryFn: async (): Promise<MarketLite[]> => {
      const { data } = await supabase.from("standby_markets").select("market_id,name,local_areas,required_count,is_active").eq("company_id", companyId!).order("name");
      return ((data ?? []) as MarketLite[]).filter((m) => m.is_active);
    },
  });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: KEY }), [qc]);
  const save = useCallback(async (m: { market_id?: string; name: string; local_areas: string[]; required_count: number }): Promise<string | null> => {
    if (!companyId) return "No company.";
    const row = { name: m.name.trim(), local_areas: m.local_areas, required_count: m.required_count };
    if (!row.name) return "Give the market a name.";
    const { error } = m.market_id
      ? await supabase.from("standby_markets").update(row).eq("market_id", m.market_id)
      : await supabase.from("standby_markets").insert({ ...row, company_id: companyId });
    if (error) return error.message;
    await refresh();
    return null;
  }, [companyId, refresh]);
  const remove = useCallback(async (marketId: string): Promise<string | null> => {
    const { error } = await supabase.from("standby_markets").update({ is_active: false }).eq("market_id", marketId);
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh]);
  return { markets: q.data ?? [], loading: q.isLoading, save, remove };
}

/** Every driver's upcoming signups plus the roster (name, region, local area), for the dispatcher's board. */
export function useStandbyBoard(companyId: string | null, enabled: boolean) {
  const q = useQuery({
    queryKey: [...KEY, "board", companyId], enabled: !!companyId && enabled, staleTime: 20_000, refetchInterval: 60_000, retry: 0,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: members } = await supabase.from("user_companies").select("user_id").eq("company_id", companyId!);
      const ids = (members ?? []).map((m: any) => m.user_id as string);
      const [{ data: sg }, { data: names }] = await Promise.all([
        supabase.from("standby_signups").select("signup_id,user_id,start_at,end_at,withdrawn_at").eq("company_id", companyId!).is("withdrawn_at", null).gt("end_at", since).order("start_at").limit(2000),
        ids.length ? supabase.rpc("get_display_names_full", { p_user_ids: ids }) : Promise.resolve({ data: [] as any[] }),
      ]);
      const drivers: DriverLite[] = ((names ?? []) as any[]).map((r) => ({ user_id: r.user_id, name: r.display_name ?? "Unknown", region: r.region ?? null, local_area: r.local_area ?? null }));
      return { signups: (sg ?? []) as SignupLite[], drivers };
    },
  });
  return { signups: q.data?.signups ?? [], drivers: q.data?.drivers ?? [], loading: q.isLoading };
}
