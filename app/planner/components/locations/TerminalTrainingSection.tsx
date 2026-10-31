"use client";
// app/planner/components/locations/TerminalTrainingSection.tsx
//
// The training half of a terminal's page in the Locations hub: what the terminal asks for (online course,
// video, in person; the link; how often it renews), this driver's training date, the driver's company
// authorization letter, and, for dispatch and admin, where each driver stands. Separate from the card's
// renewal period. Anyone can set up what a terminal requires, like the access steps.

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useDashLook } from "@/app/planner/home/dashLook";
import { EXPIRY_COLOR } from "@/lib/expiry";
import {
  TRAINING_MODES, expiresAfterCompletion, trainingModeLabel, trainingStatus,
  type TrainingMode, type TrainingReq, type TrainingRecord,
} from "@/lib/terminals/training";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { fieldInput } from "../trip/tripUi";

export const TRAINING_QUERY_KEY = "terminalTraining";

const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };
const fmt = (iso: string | null | undefined) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${m}/${d}/${y.slice(2)}`; };
const url = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);

type Detail = { req: TrainingReq | null; mine: (TrainingRecord & { id: string }) | null; all: (TrainingRecord & { user_id: string })[]; letters: { id: string; file_path: string; original_name: string | null; created_at: string }[] };

export function useTrainingDetail(terminalId: string, userId: string | null, staff: boolean) {
  return useQuery({
    queryKey: [TRAINING_QUERY_KEY, terminalId, userId, staff],
    enabled: !!userId && !!terminalId,
    queryFn: async (): Promise<Detail> => {
      const [r, m, a, l] = await Promise.all([
        supabase.from("terminal_training").select("*").eq("terminal_id", terminalId).maybeSingle(),
        supabase.from("driver_terminal_training").select("*").eq("terminal_id", terminalId).eq("user_id", userId!).maybeSingle(),
        staff ? supabase.from("driver_terminal_training").select("user_id, completed_at, expires_at").eq("terminal_id", terminalId) : Promise.resolve({ data: [] as any[] }),
        supabase.from("driver_authorization_letters").select("id, file_path, original_name, created_at").eq("user_id", userId!).is("retired_at", null).order("created_at", { ascending: false }),
      ]);
      return { req: (r.data ?? null) as TrainingReq | null, mine: (m.data ?? null) as any, all: (a.data ?? []) as any, letters: (l.data ?? []) as any };
    },
  });
}

export function TerminalTrainingSection({ terminalId, terminalName, userId, companyId, staff }: {
  terminalId: string; terminalName: string; userId: string | null; companyId: string | null; staff: boolean;
}) {
  const L = useDashLook();
  const qc = useQueryClient();
  const { data } = useTrainingDetail(terminalId, userId, staff);
  const roster = useCompanyRoster(staff ? companyId : null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState({ required: true, mode: "online" as TrainingMode, url: "", instructions: "", months: "12" });
  const [dateEdit, setDateEdit] = useState<string | null>(null);

  const req = data?.req ?? null;
  const mine = data?.mine ?? null;
  const status = trainingStatus(req, mine);
  const refresh = () => qc.invalidateQueries({ queryKey: [TRAINING_QUERY_KEY] });
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    await refresh();
    return true;
  };

  function startEdit() {
    setDraft({ required: req?.required ?? true, mode: (req?.mode ?? "online") as TrainingMode, url: req?.url ?? "", instructions: req?.instructions ?? "", months: req?.renewal_months ? String(req.renewal_months) : "" });
    setEditing(true);
  }
  async function saveReq() {
    const months = draft.months.trim() ? Math.round(Number(draft.months)) : null;
    if (months != null && !(months >= 1 && months <= 60)) { setErr("Renewal must be 1 to 60 months."); return; }
    const ok = await run(() => supabase.from("terminal_training").upsert({
      terminal_id: terminalId, required: draft.required, mode: draft.required ? draft.mode : null,
      url: draft.url.trim() || null, instructions: draft.instructions.trim() || null, renewal_months: months,
    }));
    if (ok) setEditing(false);
  }
  async function saveMine(rec: { completed_at: string | null; expires_at: string | null }) {
    if (!userId) return;
    await run(() => supabase.from("driver_terminal_training").upsert({ user_id: userId, terminal_id: terminalId, company_id: companyId, ...rec }, { onConflict: "user_id,terminal_id" }));
  }
  const markDone = () => { const d = today(); void saveMine({ completed_at: d, expires_at: expiresAfterCompletion(d, req?.renewal_months) ?? mine?.expires_at ?? null }); };

  async function upload(file: File) {
    if (!userId || !companyId) return;
    setBusy(true); setErr(null);
    try {
      const id = crypto.randomUUID();
      const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
      const path = `${companyId}/authorization_letters/${userId}/${id}.${ext}`;
      const up = await supabase.storage.from("equipment-docs").upload(path, file, { contentType: file.type || undefined });
      if (up.error) throw up.error;
      const ins = await supabase.from("driver_authorization_letters").insert({ id, user_id: userId, company_id: companyId, file_path: path, original_name: file.name, mime_type: file.type || null });
      if (ins.error) throw ins.error;
      await refresh();
    } catch (e: any) { setErr(e?.message ?? "Couldn't upload."); }
    setBusy(false);
  }
  async function viewLetter(path: string) {
    const { data: s } = await supabase.storage.from("equipment-docs").createSignedUrl(path, 300);
    if (s?.signedUrl) window.open(s.signedUrl, "_blank", "noopener");
  }

  const card: React.CSSProperties = { ...L.secondary, padding: 12, marginBottom: 10, color: "#fff" };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };
  const btn: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", borderRadius: 2, fontSize: 13, fontWeight: 700, padding: "9px 12px", cursor: "pointer" };
  const statusColor = status.state === "none" ? L.muted : EXPIRY_COLOR[status.state];
  const nameOf = (id: string) => roster.members.find((m) => m.user_id === id)?.display_name ?? "Driver";

  return (
    <>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={label}>Training at {terminalName}</div>
          {!editing && <button type="button" onClick={startEdit} style={{ border: "none", background: "transparent", color: L.muted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{req ? "Edit" : "Set up"}</button>}
        </div>
        {!editing && !req && <div style={{ fontSize: 13, color: L.muted }}>Nobody has said whether this terminal requires training. Tap Set up.</div>}
        {!editing && req && !req.required && <div style={{ fontSize: 13, color: L.muted }}>No training required.</div>}
        {!editing && req?.required && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{trainingModeLabel(req.mode)}{req.renewal_months ? ` · renews every ${req.renewal_months % 12 === 0 ? `${req.renewal_months / 12} year${req.renewal_months === 12 ? "" : "s"}` : `${req.renewal_months} months`}` : " · one time"}</div>
            {req.instructions && <div style={{ fontSize: 13, color: L.muted, marginTop: 4 }}>{req.instructions}</div>}
            {req.url && <button type="button" onClick={() => window.open(url(req.url!), "_blank", "noopener")} style={{ ...btn, marginTop: 8 }}>Open training link ›</button>}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={label}>Your training</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: statusColor }}>{mine?.expires_at ? `Expires ${fmt(mine.expires_at)}` : status.text}</span>
                {mine?.expires_at && <span style={{ fontSize: 12, color: statusColor }}>{status.text}</span>}
              </div>
              {mine?.completed_at && <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>Completed {fmt(mine.completed_at)}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button type="button" disabled={busy} onClick={markDone} style={{ ...btn, background: "#fff", color: "#000", border: "1px solid #fff" }}>I completed it today</button>
                <button type="button" onClick={() => setDateEdit(mine?.expires_at ?? "")} style={btn}>Set expiration date</button>
              </div>
              {dateEdit != null && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="date" value={dateEdit} onChange={(e) => setDateEdit(e.target.value)} style={{ ...fieldInput, flex: 1 }} />
                  <button type="button" disabled={!dateEdit || busy} onClick={() => { void saveMine({ completed_at: mine?.completed_at ?? null, expires_at: dateEdit }).then(() => setDateEdit(null)); }} style={btn}>Save</button>
                </div>
              )}
              <div style={{ fontSize: 11, color: L.muted, marginTop: 6 }}>Training dates are separate from your terminal card renewal.</div>
            </div>
          </>
        )}
        {editing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[true, false].map((v) => (
                <button key={String(v)} type="button" onClick={() => setDraft({ ...draft, required: v })}
                  style={{ ...btn, flex: 1, background: draft.required === v ? "#fff" : "transparent", color: draft.required === v ? "#000" : "#fff" }}>{v ? "Training required" : "No training"}</button>
              ))}
            </div>
            {draft.required && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TRAINING_MODES.map((m) => (
                    <button key={m.id} type="button" onClick={() => setDraft({ ...draft, mode: m.id })}
                      style={{ ...btn, background: draft.mode === m.id ? "#fff" : "transparent", color: draft.mode === m.id ? "#000" : "#fff" }}>{m.label}</button>
                  ))}
                </div>
                <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Training or orientation link" style={fieldInput} />
                <input value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} placeholder="Notes (who to ask, what to bring)" style={fieldInput} />
                <div>
                  <div style={label}>Renews every (months, blank = one time)</div>
                  <input inputMode="numeric" value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value.replace(/\D/g, "") })} placeholder="12 for yearly" style={fieldInput} />
                </div>
              </>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={busy} onClick={() => void saveReq()} style={{ ...btn, flex: 1, background: "#fff", color: "#000" }}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setEditing(false)} style={btn}>Cancel</button>
            </div>
          </div>
        )}
        {err && <div style={{ fontSize: 12, color: "#f87171", marginTop: 8 }}>{err}</div>}
      </div>

      <div style={card}>
        <div style={label}>Company authorization letter</div>
        <div style={{ fontSize: 12, color: L.muted, marginBottom: 8 }}>Stays with you and works at every terminal that asks for it.</div>
        {(data?.letters ?? []).slice(0, 1).map((l) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.original_name ?? "Letter"} <span style={{ color: L.muted, fontWeight: 500 }}>· {fmt(l.created_at.slice(0, 10))}</span></span>
            <button type="button" onClick={() => void viewLetter(l.file_path)} style={btn}>View</button>
          </div>
        ))}
        <label style={{ ...btn, display: "block", textAlign: "center", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Uploading…" : data?.letters?.length ? "Upload a new letter" : "Upload letter (photo or PDF)"}
          <input type="file" accept="image/*,application/pdf" disabled={busy} style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        </label>
      </div>

    </>
  );
}

/** Each driver's training date at this terminal (dispatch, lead and admin). */
export function TerminalDriversTraining({ terminalId, userId, companyId }: { terminalId: string; userId: string | null; companyId: string | null }) {
  const L = useDashLook();
  const { data } = useTrainingDetail(terminalId, userId, true);
  const roster = useCompanyRoster(companyId);
  const req = data?.req ?? null;
  if (!req?.required) return <div style={{ fontSize: 13, color: L.muted, padding: "6px 0" }}>No training required here, so there is nothing to track.</div>;
  return (
    <div style={{ ...L.secondary, padding: 12, marginBottom: 10, color: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Driver training</div>
      {roster.members.map((m) => {
        const rec = data?.all.find((x) => x.user_id === m.user_id) ?? null;
        const st = trainingStatus(req, rec);
        return (
          <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", fontSize: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span>{m.display_name}</span>
            <span style={{ color: st.state === "none" ? L.muted : EXPIRY_COLOR[st.state], fontWeight: 700 }}>{rec?.expires_at ? `${fmt(rec.expires_at)} · ${st.text}` : st.text}</span>
          </div>
        );
      })}
    </div>
  );
}
