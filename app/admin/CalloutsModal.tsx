"use client";
// app/admin/CalloutsModal.tsx
//
// Call-outs for dispatch and admins: the list, a new call-out for a driver, correcting one, withdrawing one. Every
// change by dispatch is attributed (entered by / withdrawn by) and sends a correction email to dispatch and the
// regional manager. Written through the same offline store and email path as the driver's own call-out.
// Thin wrapper around CalloutsView; used from the Dispatch board and the Company Dashboard.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PickSheet } from "@/lib/ui/PickSheet";
import { useTripStore } from "@/lib/trips/useTripStore";
import { useTripSettings } from "@/lib/trips/useTripData";
import { reasonsOrDefault } from "@/lib/reasons/reasons";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { deviceTz } from "@/lib/reports/dateRange";
import { createCallout, editCallout, groupCallouts, withdrawCallout } from "@/lib/callouts/callout";
import { remember, sendCallout } from "@/lib/callouts/send";
import type { CalloutRow } from "@/lib/trips/types";
import { CalloutForm, type CalloutFormValue } from "@/app/planner/components/callouts/CalloutForm";
import { CalloutsView } from "./CalloutsView";

export default function CalloutsModal({ open, onClose, companyId, userId, canEdit, focusDriverId, focusDate }: {
  open: boolean; onClose: () => void; companyId: string; userId: string | null; canEdit: boolean; focusDriverId?: string | null; focusDate?: string | null;
}) {
  const tz = useMemo(() => deviceTz(), []);
  const { state, store, syncNow } = useTripStore(userId);
  const { reasons } = useTripSettings(open ? companyId : null);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Driver";
  const [divisions, setDivisions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "new" | "edit"; row?: CalloutRow } | null>(null);
  const [pickDriver, setPickDriver] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !companyId || !store) return;
    let alive = true;
    setLoading(true); setError(null);
    const since = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
    void Promise.all([
      supabase.from("callouts").select("*").eq("company_id", companyId).gte("shift_date", since).limit(1000),
      supabase.from("callout_routes").select("division").eq("company_id", companyId).not("division", "is", null),
    ]).then(([c, r]) => {
      if (!alive) return;
      if (c.error) setError(c.error.message); else store.hydrate("callouts", (c.data ?? []) as CalloutRow[]);
      setDivisions([...new Set(((r.data ?? []) as { division: string }[]).map((x) => x.division))].sort());
      setLoading(false);
    });
    return () => { alive = false; };
  }, [open, companyId, store]);

  const rows = useMemo(() => (store ? store.list("callouts", (c) => c.company_id === companyId) : []), [store, companyId, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupCallouts(rows, Date.now(), tz), [rows, tz]);

  const emailAfter = async (id: string, event: "created" | "edited" | "withdrawn") => {
    if (!userId) return;
    remember(userId, { id, event, tz });
    await syncNow();
    void sendCallout(userId, { id, event, tz });
  };

  const save = async (v: CalloutFormValue) => {
    if (!store || !userId) return;
    setBusy(true); setError(null);
    try {
      if (form?.mode === "edit" && form.row) {
        const next = editCallout(store, form.row.callout_id, userId, { reason: v.reason, reasonId: v.reasonId, note: v.note, date: v.date, time: v.time }, v.category, tz);
        if (next) await emailAfter(next.callout_id, "edited");
      } else {
        // A new call-out for a driver: their region, local area and division decide who is emailed.
        const { data } = await supabase.rpc("get_display_names_full", { p_user_ids: [driverId] });
        const d = ((data ?? []) as { region?: string | null; local_area?: string | null }[])[0] ?? {};
        const row = createCallout(store, { companyId, driverId, actorId: userId, input: { reason: v.reason, reasonId: v.reasonId, note: v.note, date: v.date, time: v.time }, category: v.category, division: v.division, region: d.region ?? null, localArea: d.local_area ?? null, tz });
        await emailAfter(row.callout_id, "created");
      }
      setForm(null);
    } catch (e: any) { setError(e?.message ?? "Couldn't save."); }
    setBusy(false);
  };

  const withdraw = async (c: CalloutRow) => {
    if (!store || !userId) return;
    withdrawCallout(store, c.callout_id, userId, new Date().toISOString());
    await emailAfter(c.callout_id, "withdrawn");
  };

  return (
    <>
      <FullscreenModal open={open && !form} title="Call-outs" onClose={onClose} footer={null}>
        <CalloutsView upcoming={groups.upcoming} past={groups.past} nameOf={nameOf} tz={tz} canEdit={canEdit} loading={loading} error={error} highlightId={null}
          onNew={() => setPickDriver(true)} onEdit={(c) => setForm({ mode: "edit", row: c })} onWithdraw={(c) => void withdraw(c)} />
      </FullscreenModal>
      <PickSheet open={pickDriver} title="Driver" allLabel="Choose a driver" options={members.map((m) => ({ value: m.user_id, label: m.display_name }))} value={driverId}
        onPick={(v) => { if (v) { setDriverId(v); setForm({ mode: "new" }); } }} onClose={() => setPickDriver(false)} />
      <FullscreenModal open={!!form} title={form?.mode === "edit" ? `Correct call-out · ${nameOf(form.row!.user_id)}` : `New call-out · ${nameOf(driverId)}`} onClose={() => setForm(null)} footer={null}>
        {form && (
          <CalloutForm key={form.row?.callout_id ?? "new"} reasons={reasonsOrDefault(reasons as any, "callout")} divisions={divisions} tz={tz}
            initial={form.row ? { pick: { reasonId: form.row.reason_id, label: form.row.reason, category: form.row.category, note: form.row.note }, date: form.row.shift_date, time: new Date(form.row.shift_start_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz || undefined }), division: form.row.division } : { date: focusDate ?? undefined }}
            submitLabel={form.mode === "edit" ? "Save correction" : "Create call-out"} busy={busy} onSubmit={(v) => void save(v)} />
        )}
        {error && form && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{error}</div>}
      </FullscreenModal>
    </>
  );
}
