"use client";
// app/planner/components/safety/SafetyMeetingSheet.tsx
//
// Safety meetings for the driver: what's coming (with the Zoom link and the material), and Sign in once a meeting
// is open. Signing is on screen with a finger. Presentational: the caller saves the signature.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { SignaturePad } from "@/lib/ui/SignaturePad";
import { canSign, meetingState, signProblem, type Meeting } from "@/lib/safety/safetyMeeting";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const btn = (on?: boolean): React.CSSProperties => ({ padding: "11px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export function SafetyMeetingSheet({ open, onClose, meetings, signed, loading, onSign, onMaterial }: {
  open: boolean;
  onClose: () => void;
  meetings: Meeting[];
  signed: Record<string, string>;
  loading: boolean;
  onSign: (m: Meeting, path: string) => Promise<string | null>;
  onMaterial: (path: string) => void;
}) {
  const [signing, setSigning] = useState<Meeting | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setSigning(null); setPath(null); setErr(null); } }, [open]);

  return (
    <>
      <FullscreenModal open={open && !signing} title="Safety meeting" onClose={onClose} footer={null}>
        {loading && meetings.length === 0 && <div style={{ color: MUTE }}>Loading…</div>}
        {!loading && meetings.length === 0 && <div style={{ color: MUTE, fontSize: 15 }}>No safety meetings are scheduled.</div>}
        {meetings.map((m) => {
          const st = meetingState(m);
          const done = signed[m.meeting_id];
          return (
            <div key={m.meeting_id} style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{m.title}</div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 2 }}>{m.scheduled_for} · {st === "scheduled" ? "Not started yet" : "Open for sign-in"}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {m.zoom_url && <a href={m.zoom_url} target="_blank" rel="noopener noreferrer" style={{ ...btn(), textDecoration: "none", display: "inline-block" }}>Join on Zoom</a>}
                {m.attachment_path && <button type="button" style={btn()} onClick={() => onMaterial(m.attachment_path!)}>Open {m.attachment_name ?? "the slides"}</button>}
                {done
                  ? <span style={{ alignSelf: "center", fontSize: 13, fontWeight: 800, color: "#4ade80" }}>✓ Signed {new Date(done).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  : canSign(m) ? <button type="button" style={btn(true)} onClick={() => { setSigning(m); setPath(null); setErr(null); }}>Sign in</button> : null}
              </div>
            </div>
          );
        })}
      </FullscreenModal>
      <FullscreenModal open={!!signing} title="Sign in" onClose={() => setSigning(null)} footer={null}>
        {signing && (
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{signing.title}</div>
            <div style={{ fontSize: 13, color: MUTE, margin: "2px 0 14px" }}>{signing.scheduled_for}. By signing you confirm you attended.</div>
            <div style={{ color: "#fff", border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 10 }}><SignaturePad onChange={(p) => { setPath(p); setErr(null); }} /></div>
            {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
            <button type="button" disabled={busy} aria-busy={busy} style={{ width: "100%", marginTop: 16, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", opacity: busy ? 0.6 : 1 }}
              onClick={async () => { const p = signProblem(path); if (p) { setErr(p); return; } setBusy(true); const e = await onSign(signing, path!); setBusy(false); if (e) setErr(e); else setSigning(null); }}>
              {busy ? "Saving…" : "Sign and submit"}
            </button>
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
