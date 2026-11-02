"use client";
// app/planner/hooks/useMyCallouts.ts
//
// The driver's call-outs: written through the offline store (a call-out made with no signal lands later), then the
// server is asked to send the email once it has synced (and again later if that can't happen yet). Also the
// company's call-out divisions and the driver's own region, local area and division for routing.
// The rules are in lib/callouts/callout.ts.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TripStore, TripStoreState } from "@/lib/trips/tripStore";
import type { CalloutRow } from "@/lib/trips/types";
import { canWithdraw, createCallout, withdrawCallout, type CalloutInput } from "@/lib/callouts/callout";
import { remember, retryPending, sendCallout } from "@/lib/callouts/send";
import { deviceTz } from "@/lib/reports/dateRange";

type Profile = { region: string | null; local_area: string | null; division: string | null };

export function useMyCallouts(o: { store: TripStore | null; state: TripStoreState; syncNow: () => unknown; userId: string | null; companyId: string | null; enabled: boolean }) {
  const { store, state, syncNow, userId, companyId, enabled } = o;
  const tz = useMemo(() => deviceTz(), []);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [profile, setProfile] = useState<Profile>({ region: null, local_area: null, division: null });

  useEffect(() => { if (userId) void retryPending(userId); }, [userId]);
  useEffect(() => {
    if (!enabled || !userId || !companyId || !store) return;
    let alive = true;
    void (async () => {
      const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
      const [r, p, c] = await Promise.all([
        supabase.from("callout_routes").select("division").eq("company_id", companyId).not("division", "is", null),
        supabase.from("profiles").select("region, local_area, division").eq("user_id", userId).maybeSingle(),
        supabase.from("callouts").select("*").eq("user_id", userId).gte("shift_date", since),
      ]);
      if (!alive) return;
      setDivisions([...new Set(((r.data ?? []) as { division: string }[]).map((x) => x.division))].sort());
      setProfile((p.data as Profile | null) ?? { region: null, local_area: null, division: null });
      if (!c.error) store.hydrate("callouts", (c.data ?? []) as CalloutRow[]);
    })();
    return () => { alive = false; };
  }, [enabled, userId, companyId, store]);

  const mine = useMemo(
    () => (store && userId ? store.list("callouts", (c) => c.user_id === userId) : []).sort((a, b) => b.shift_start_at.localeCompare(a.shift_start_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, userId, state],
  );

  const create = useCallback(async (input: CalloutInput, category: string | null, division: string | null): Promise<"sent" | "waiting" | "not_sent"> => {
    if (!store || !userId || !companyId) return "waiting";
    const row = createCallout(store, { companyId, driverId: userId, actorId: userId, input, category, division, region: profile.region, localArea: profile.local_area, tz });
    remember(userId, { id: row.callout_id, event: "created", tz });
    await syncNow();
    return sendCallout(userId, { id: row.callout_id, event: "created", tz });
  }, [store, userId, companyId, profile, tz, syncNow]);

  const withdraw = useCallback(async (id: string): Promise<boolean> => {
    if (!store || !userId) return false;
    const c = store.get("callouts", id);
    if (!c || !canWithdraw(c, Date.now(), false)) return false;
    withdrawCallout(store, id, userId, new Date().toISOString());
    remember(userId, { id, event: "withdrawn", tz });
    await syncNow();
    void sendCallout(userId, { id, event: "withdrawn", tz });
    return true;
  }, [store, userId, tz, syncNow]);

  return { mine, divisions, profile, tz, create, withdraw };
}
