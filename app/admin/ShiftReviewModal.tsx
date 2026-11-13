"use client";
// app/admin/ShiftReviewModal.tsx
//
// Company Dashboard → Needs you → shifts. The shifts a manager can clear: a long shift nobody explained (pick a
// reason) and a shift the driver never ended (confirm it, with the time it really ended). Each saves an ordinary
// shift event marked as entered by the manager.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReasonChips, type ReasonPick } from "@/app/planner/components/reasons/ReasonChips";
import { reasonsOrDefault, type Reason } from "@/lib/reasons/reasons";
import { clockHM } from "@/lib/shifts/shiftLogic";
import { explanationProblem } from "@/lib/shifts/explanation";
import { managerConfirmEvent, managerExplanationEvent, reviewRows, type ReviewRow } from "@/lib/shifts/review";
import type { ShiftEventRow } from "@/lib/trips/types";

const HAIR = "rgba(255,255,255,0.12)";
const MUTE = "rgba(255,255,255,0.52)";
const btn = (primary: boolean): React.CSSProperties => ({ padding: "11px 14px", fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", border: primary ? "none" : `1px solid ${HAIR}`, background: primary ? "#fff" : "transparent", color: primary ? "#000" : "#fff" });

const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
// <input type="datetime-local"> wants local time without a zone.
const toLocalInput = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function ShiftReviewModal({ open, onClose, companyId, managerId, events, maxHours, onChanged }: {
  open: boolean; onClose: () => void; companyId: string; managerId: string; events: ShiftEventRow[]; maxHours: number; onChanged: () => void;
}) {
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Driver";
  const [reasonList, setReasonList] = useState<Reason[]>([]);
  useEffect(() => {
    if (!open) return;
    void supabase.from("delay_reasons").select("reason_id,kind,label,sort_order,is_active,category").eq("company_id", companyId).then(({ data }) => setReasonList((data ?? []) as Reason[]));
  }, [open, companyId]);
  const reasons = useMemo(() => reasonsOrDefault(reasonList, "shift_explanation"), [reasonList]);

  const rows = useMemo(() => {
    const now = new Date().toISOString();
    return reviewRows(events, maxHours, now, new Date(Date.now() - 30 * 86400_000).toISOString(), new Date(Date.now() - 7 * 86400_000).toISOString());
  }, [events, maxHours, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const [openKey, setOpenKey] = useState<{ key: string; mode: "reason" | "confirm" } | null>(null);
  const [pick, setPick] = useState<ReasonPick | null>(null);
  const [endAt, setEndAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!open) { setOpenKey(null); setErr(null); } }, [open]);

  const start = (r: ReviewRow, mode: "reason" | "confirm") => {
    setOpenKey({ key: r.key, mode }); setPick(null); setErr(null);
    setEndAt(toLocalInput(r.endedAt ?? new Date().toISOString()));
  };
  const save = async (r: ReviewRow) => {
    if (!openKey) return;
    setErr(null);
    const now = new Date().toISOString();
    let ev: ReturnType<typeof managerConfirmEvent> | ReturnType<typeof managerExplanationEvent>;
    if (openKey.mode === "reason") {
      const p = explanationProblem(pick);
      if (p) return setErr(p);
      ev = managerExplanationEvent({ companyId, managerId, row: r, pick: pick!, now });
    } else {
      ev = managerConfirmEvent({ companyId, managerId, row: r, endAt: endAt ? new Date(endAt).toISOString() : "", now });
      if ("error" in ev) return setErr(ev.error);
    }
    setBusy(true);
    const { error } = await supabase.from("shift_events").insert({ event_id: crypto.randomUUID(), ...ev });
    setBusy(false);
    if (error) return setErr(error.message);
    setOpenKey(null);
    onChanged();
  };

  return (
    <FullscreenModal open={open} title="Shifts to review" onClose={onClose} footer={null}>
      <div style={{ fontSize: 13, color: MUTE, marginBottom: 14 }}>Explain a shift that ran past {maxHours} h, or confirm one the driver never ended. Your entries are marked as entered by a manager.</div>
      {rows.length === 0 && <div style={{ fontSize: 14, color: MUTE }}>Nothing to review.</div>}
      {rows.map((r) => {
        const o = openKey?.key === r.key ? openKey : null;
        return (
          <div key={r.key} style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 14, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{nameOf(r.userId)}</div>
              <div className="dash-num" style={{ fontSize: 15, fontWeight: 800 }}>{clockHM(r.hours)}</div>
            </div>
            <div style={{ fontSize: 12, color: MUTE, marginTop: 2 }}>{stamp(r.startedAt)}{r.endedAt ? ` → ${stamp(r.endedAt)}` : " → still open"}</div>
            <div style={{ fontSize: 12, marginTop: 6, color: "#fbbf24" }}>{[r.needsReason ? "No explanation" : null, r.needsConfirm ? "Never ended by the driver" : null].filter(Boolean).join(" · ")}</div>
            {!o && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {r.needsReason && <button type="button" style={btn(false)} onClick={() => start(r, "reason")}>Give reason</button>}
                {r.needsConfirm && <button type="button" style={btn(false)} onClick={() => start(r, "confirm")}>Confirm</button>}
              </div>
            )}
            {o?.mode === "reason" && (
              <div style={{ marginTop: 12 }}>
                <ReasonChips reasons={reasons} value={pick} onPick={(p) => { setPick(p); setErr(null); }} />
              </div>
            )}
            {o?.mode === "confirm" && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>When did the shift end?</div>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", background: "#0a0a0b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, padding: "11px 12px", colorScheme: "dark" }} />
                <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Starts at the driver&apos;s last activity. Change it to when they really stopped.</div>
              </div>
            )}
            {o && (
              <>
                {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" aria-busy={busy} disabled={busy} style={btn(true)} onClick={() => void save(r)}>{busy ? "Saving…" : o.mode === "reason" ? "Save reason" : "Confirm shift"}</button>
                  <button type="button" style={btn(false)} onClick={() => setOpenKey(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </FullscreenModal>
  );
}
