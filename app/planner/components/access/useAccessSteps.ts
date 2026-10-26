"use client";
// app/planner/components/access/useAccessSteps.ts
//
// Data for terminal access steps (see lib/terminals/accessSteps.ts):
// the driver's in-progress qualifications with their terminals' requirements
// and completed-load counts, plus one terminal's full detail for the steps
// sheet. React Query so the sheet can refresh the dashboard strip.

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { AccessProgress, AccessRequirements } from "@/lib/terminals/accessSteps";

export type AuthorizationLetter = {
  id: string; user_id: string; company_id: string; file_path: string;
  original_name: string | null; mime_type: string | null; created_at: string; retired_at: string | null;
};

export type AccessEntry = { prog: AccessProgress; req: AccessRequirements | null; loadsCompleted: number };

export const ACCESS_QUERY_KEY = "terminalAccessSteps";

export function invalidateAccess(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: [ACCESS_QUERY_KEY] });
}

// Completed loads by this driver at each terminal since that terminal's
// qualification started.
async function countLoads(userId: string, progs: AccessProgress[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (progs.length === 0) return out;
  const since = progs.map((p) => p.started_at).sort()[0];
  const { data } = await supabase
    .from("load_log")
    .select("terminal_id, created_at")
    .eq("user_id", userId)
    .eq("status", "loaded")
    .in("terminal_id", progs.map((p) => p.terminal_id))
    .gte("created_at", since);
  for (const p of progs) {
    const rows = (data ?? []) as { terminal_id: string; created_at: string }[];
    const n = rows.filter((r) => String(r.terminal_id) === p.terminal_id && Date.parse(r.created_at) >= Date.parse(p.started_at)).length;
    out.set(p.terminal_id, n);
  }
  return out;
}

export function useAccessQualifications(userId: string | null | undefined) {
  return useQuery({
    queryKey: [ACCESS_QUERY_KEY, "all", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, AccessEntry>> => {
      const { data: progs, error } = await supabase
        .from("driver_terminal_qualifications").select("*").eq("user_id", userId!);
      if (error) throw error;
      const list = (progs ?? []) as AccessProgress[];
      const map = new Map<string, AccessEntry>();
      if (list.length === 0) return map;
      const [{ data: reqs }, loads] = await Promise.all([
        supabase.from("terminal_access_requirements").select("*").in("terminal_id", list.map((p) => p.terminal_id)),
        countLoads(userId!, list),
      ]);
      for (const p of list) {
        map.set(p.terminal_id, {
          prog: p,
          req: ((reqs ?? []) as AccessRequirements[]).find((r) => r.terminal_id === p.terminal_id) ?? null,
          loadsCompleted: loads.get(p.terminal_id) ?? 0,
        });
      }
      return map;
    },
  });
}

export type AccessDetail = {
  req: AccessRequirements | null;
  prog: AccessProgress | null;
  loadsCompleted: number;
  letters: AuthorizationLetter[];
};

export function useTerminalAccessDetail(terminalId: string | null, userId: string | null | undefined) {
  return useQuery({
    queryKey: [ACCESS_QUERY_KEY, "one", terminalId, userId],
    enabled: !!terminalId && !!userId,
    queryFn: async (): Promise<AccessDetail> => {
      const [r, p, l] = await Promise.all([
        supabase.from("terminal_access_requirements").select("*").eq("terminal_id", terminalId!).maybeSingle(),
        supabase.from("driver_terminal_qualifications").select("*").eq("terminal_id", terminalId!).eq("user_id", userId!).maybeSingle(),
        supabase.from("driver_authorization_letters").select("*").eq("user_id", userId!).is("retired_at", null).order("created_at", { ascending: false }),
      ]);
      if (r.error) throw r.error;
      if (p.error) throw p.error;
      const prog = (p.data ?? null) as AccessProgress | null;
      const loads = prog ? (await countLoads(userId!, [prog])).get(prog.terminal_id) ?? 0 : 0;
      return { req: (r.data ?? null) as AccessRequirements | null, prog, loadsCompleted: loads, letters: (l.data ?? []) as AuthorizationLetter[] };
    },
  });
}

export { OPEN_ACCESS_STEPS_EVENT, openAccessSteps, type OpenAccessStepsDetail } from "../../utils/openAccessSteps";
