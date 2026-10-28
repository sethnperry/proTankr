"use client";
// The period a person's reports use: their own if they set one, else the company's.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { PeriodSettings } from "./periodOptions";
import type { PayPeriodType } from "@/app/admin/payPeriods";
import { deviceTz } from "./dateRange";

export function useReportPeriods(companyId: string | null | undefined, userId: string | null | undefined) {
  const [state, setState] = useState<{ settings: PeriodSettings | null; tz: string; ready: boolean }>({ settings: null, tz: deviceTz(), ready: false });
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const uid = userId ?? (await supabase.auth.getUser()).data.user?.id;
        if (!uid) { if (!dead) setState((s) => ({ ...s, ready: true })); return; }
        const [c, p] = await Promise.all([
          companyId ? supabase.from("company_report_period").select("period_type, anchor_date, tz").eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null }),
          supabase.from("driver_pay_settings").select("pay_period_type, pay_period_anchor_date").eq("user_id", uid).maybeSingle(),
        ]);
        const cd = c.data as { period_type: PayPeriodType; anchor_date: string; tz: string } | null;
        const pd = p.data as { pay_period_type: PayPeriodType | null; pay_period_anchor_date: string | null } | null;
        const settings: PeriodSettings | null = pd?.pay_period_type && pd.pay_period_anchor_date ? { type: pd.pay_period_type, anchor: pd.pay_period_anchor_date } : cd ? { type: cd.period_type, anchor: cd.anchor_date } : null;
        if (!dead) setState({ settings, tz: cd?.tz || deviceTz(), ready: true });
      } catch { if (!dead) setState((s) => ({ ...s, ready: true })); }
    })();
    return () => { dead = true; };
  }, [companyId, userId]);
  return state;
}
