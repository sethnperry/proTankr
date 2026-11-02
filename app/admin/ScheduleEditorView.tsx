"use client";
// app/admin/ScheduleEditorView.tsx
//
// The one scheduler editor: what to send (a template), when (a cadence), and to whom (people by role and
// region, or an address). Reminders and recaps for every form are made here; no form sends its own.
// Presentational: it edits a draft and calls onSave. The data hook is app/admin/useNotificationSchedules.ts.

import React from "react";
import { Chip, Field, FIELD, Label, Segmented, primary } from "@/app/planner/components/trip/deliveryUi";
import type { Cadence, Recipient } from "@/lib/notify/schedule";

export type ScheduleDraft = {
  schedule_id: string | null;
  kind: "reminder" | "recap";
  template_key: string;
  payload: { subject?: string; body?: string; title?: string; lines?: string[] };
  recipients: Recipient[];
  channels: ("email" | "push")[];
  cadence: Cadence;
};

export const BLANK_SCHEDULE: ScheduleDraft = {
  schedule_id: null, kind: "reminder", template_key: "reminder", payload: { subject: "", body: "" },
  recipients: [], channels: ["email"], cadence: { freq: "weekly", at: "08:00", dow: 1 },
};

const ROLES = ["admin", "dispatch", "lead", "driver"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleEditorView({ draft, onChange, onSave, busy, error, regions = [] }: {
  draft: ScheduleDraft;
  onChange: (d: ScheduleDraft) => void;
  onSave: () => void;
  busy?: boolean;
  error?: string | null;
  regions?: string[];
}) {
  const set = (p: Partial<ScheduleDraft>) => onChange({ ...draft, ...p });
  const c = draft.cadence;
  const setC = (p: Partial<Cadence>) => set({ cadence: { ...c, ...p } });
  const hasRole = (role: string) => draft.recipients.some((r) => r.type === "role" && r.value === role);
  const toggleRole = (role: string) => set({ recipients: hasRole(role) ? draft.recipients.filter((r) => !(r.type === "role" && r.value === role)) : [...draft.recipients, { type: "role", value: role }] });
  const emails = draft.recipients.filter((r) => r.type === "email").map((r) => r.value).join(", ");
  const region = draft.recipients.find((r) => r.type === "role")?.region ?? "";
  const setRegion = (v: string) => set({ recipients: draft.recipients.map((r) => (r.type === "role" ? { ...r, region: v || null } : r)) });

  return (
    <div>
      <Label first>What</Label>
      <Segmented value={draft.kind} onChange={(k) => set({ kind: k, template_key: k, payload: k === "reminder" ? { subject: "", body: "" } : { title: "", lines: [] } })}
        options={[{ id: "reminder", label: "Reminder" }, { id: "recap", label: "Recap" }]} />
      <div style={{ marginTop: 10 }}>
        {draft.kind === "reminder" ? (
          <>
            <Field label="Subject"><input style={FIELD} value={draft.payload.subject ?? ""} onChange={(e) => set({ payload: { ...draft.payload, subject: e.target.value } })} /></Field>
            <Field label="Message" style={{ marginTop: 10 }}><textarea style={{ ...FIELD, minHeight: 90, fontFamily: "inherit" }} value={draft.payload.body ?? ""} onChange={(e) => set({ payload: { ...draft.payload, body: e.target.value } })} /></Field>
          </>
        ) : (
          <>
            <Field label="Title"><input style={FIELD} value={draft.payload.title ?? ""} onChange={(e) => set({ payload: { ...draft.payload, title: e.target.value } })} /></Field>
            <Field label="Lines (one per row)" style={{ marginTop: 10 }}><textarea style={{ ...FIELD, minHeight: 90, fontFamily: "inherit" }} value={(draft.payload.lines ?? []).join("\n")} onChange={(e) => set({ payload: { ...draft.payload, lines: e.target.value.split("\n") } })} /></Field>
          </>
        )}
      </div>

      <Label>When</Label>
      <Segmented value={c.freq} onChange={(f) => setC({ freq: f })} options={[{ id: "once", label: "Once" }, { id: "daily", label: "Daily" }, { id: "weekly", label: "Weekly" }, { id: "monthly", label: "Monthly" }]} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
        <Field label="Time"><input type="time" style={FIELD} value={c.at} onChange={(e) => setC({ at: e.target.value || "08:00" })} /></Field>
        {c.freq === "once" && <Field label="Date"><input type="date" style={FIELD} value={c.on ?? ""} onChange={(e) => setC({ on: e.target.value })} /></Field>}
        {c.freq === "monthly" && <Field label="Day of month"><input type="number" min={1} max={31} style={FIELD} value={c.dom ?? 1} onChange={(e) => setC({ dom: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></Field>}
      </div>
      {c.freq === "weekly" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {DAYS.map((d, i) => <Chip key={d} on={(c.dow ?? 1) === i} onClick={() => setC({ dow: i })}>{d}</Chip>)}
        </div>
      )}

      <Label>Who</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ROLES.map((r) => <Chip key={r} on={hasRole(r)} onClick={() => toggleRole(r)}>{r[0].toUpperCase() + r.slice(1)}</Chip>)}
      </div>
      {regions.length > 0 && draft.recipients.some((r) => r.type === "role") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          <Chip on={!region} onClick={() => setRegion("")}>Every region</Chip>
          {regions.map((r) => <Chip key={r} on={region === r} onClick={() => setRegion(r)}>{r}</Chip>)}
        </div>
      )}
      <Field label="Also these addresses (comma separated)" style={{ marginTop: 10 }}>
        <input style={FIELD} value={emails} onChange={(e) => set({ recipients: [...draft.recipients.filter((r) => r.type !== "email"), ...e.target.value.split(/[,\s]+/).filter(Boolean).map((v) => ({ type: "email" as const, value: v }))] })} />
      </Field>

      <Label>How</Label>
      <div style={{ display: "flex", gap: 6 }}>
        {(["email", "push"] as const).map((ch) => (
          <Chip key={ch} on={draft.channels.includes(ch)} onClick={() => set({ channels: draft.channels.includes(ch) ? draft.channels.filter((x) => x !== ch) : [...draft.channels, ch] })}>{ch === "email" ? "Email" : "Push"}</Chip>
        ))}
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 14, marginTop: 12 }}>{error}</div>}
      <button type="button" onClick={onSave} disabled={busy} style={{ ...primary, marginTop: 18, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save schedule"}</button>
    </div>
  );
}
