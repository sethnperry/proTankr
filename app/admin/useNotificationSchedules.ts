"use client";
// app/admin/useNotificationSchedules.ts
//
// The data side of the scheduler editor: a company's schedules, and save / switch off. The first run is worked out
// here (nextRunAfter), so the server tick only has to send what is due.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { nextRunAfter, type Cadence, type Recipient } from "@/lib/notify/schedule";
import type { ScheduleDraft } from "./ScheduleEditorView";

export type ScheduleRow = { schedule_id: string; kind: "reminder" | "recap"; template_key: string; recipients: Recipient[]; channels: string[]; cadence: Cadence; payload: ScheduleDraft["payload"]; next_run_at: string | null; last_run_at: string | null; is_active: boolean };

export function useNotificationSchedules(companyId: string | null, userId: string | null) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    const { data, error: e } = await supabase.from("notification_schedules").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    if (e) setError(e.message); else setRows((data ?? []) as ScheduleRow[]);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (d: ScheduleDraft): Promise<boolean> => {
    if (!companyId) return false;
    if (d.recipients.length === 0) { setError("Pick who it goes to."); return false; }
    if (d.channels.length === 0) { setError("Pick email, push or both."); return false; }
    const next = nextRunAfter(d.cadence, Date.now());
    if (next == null) { setError("That date and time has already passed."); return false; }
    setBusy(true); setError(null);
    const body = { company_id: companyId, kind: d.kind, template_key: d.template_key, recipients: d.recipients, channels: d.channels, cadence: d.cadence, payload: d.payload, next_run_at: new Date(next).toISOString(), is_active: true };
    const res = d.schedule_id
      ? await supabase.from("notification_schedules").update(body).eq("schedule_id", d.schedule_id)
      : await supabase.from("notification_schedules").insert({ ...body, created_by: userId });
    setBusy(false);
    if (res.error) { setError(res.error.message); return false; }
    await load();
    return true;
  }, [companyId, userId, load]);

  const setActive = useCallback(async (id: string, active: boolean) => {
    await supabase.from("notification_schedules").update({ is_active: active }).eq("schedule_id", id);
    await load();
  }, [load]);

  return { rows, error, busy, save, setActive, reload: load };
}
