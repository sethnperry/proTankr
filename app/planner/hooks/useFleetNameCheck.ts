"use client";
// app/planner/hooks/useFleetNameCheck.ts
//
// Is this an invited fleet driver who hasn't given a name yet? (The invite only
// carries an email.) Solo drivers give theirs in SoloOnboarding; staff are
// skipped: dispatch and admins have names set up by whoever added them.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";

export function useFleetNameCheck() {
  const { isSolo, role, effectiveUserId, companyId, setupSession } = useCalculatorShell() as any;
  const [state, setState] = useState<{ required: boolean; companyName: string | null; checked: boolean }>({ required: false, companyName: null, checked: false });
  useEffect(() => {
    if (isSolo !== false || !effectiveUserId || !companyId || setupSession) return;
    if (role !== "driver" && role !== "lead") return;
    let off = false;
    (async () => {
      const [p, c] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("user_id", effectiveUserId).maybeSingle(),
        supabase.from("companies").select("company_name").eq("company_id", companyId).maybeSingle(),
      ]);
      if (off) return;
      if (p.error) { setState({ required: false, companyName: null, checked: true }); return; } // can't tell: don't block
      const name = (p.data as { display_name?: string | null } | null)?.display_name;
      setState({ required: !(name && name.trim()), companyName: (c.data as { company_name?: string } | null)?.company_name ?? null, checked: true });
    })();
    return () => { off = true; };
  }, [isSolo, role, effectiveUserId, companyId, setupSession]);
  // A fleet driver whose name hasn't been looked up yet: show nothing rather than flash the next gate first.
  const applies = isSolo === false && !!effectiveUserId && !!companyId && !setupSession && (role === "driver" || role === "lead");
  return { ...state, pending: applies && !state.checked, done: () => setState((s) => ({ ...s, required: false })) };
}
