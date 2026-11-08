"use client";
// app/planner/components/callouts/CalloutSheet.tsx
//
// "Call out": the driver calls out of a shift on one screen, and sees their upcoming call-outs with a Withdraw
// button until the shift starts. Presentational: the caller writes the call-out and sends the email.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CalloutForm, type CalloutFormValue } from "./CalloutForm";
import { canWithdraw } from "@/lib/callouts/callout";
import type { CalloutRow } from "@/lib/trips/types";

const MUTE = "rgba(255,255,255,0.5)";
const when = (c: CalloutRow, tz: string) => `${new Date(c.shift_start_at).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: tz || undefined })} ${new Date(c.shift_start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined })}`;

export function CalloutSheet({ open, onClose, reasons, divisions, defaultDivision, tz, mine, onCreate, onWithdraw }: {
  open: boolean;
  onClose: () => void;
  reasons: { reason_id: string; label: string; category: string | null }[];
  divisions: string[];
  defaultDivision: string | null;
  tz: string;
  mine: CalloutRow[];
  onCreate: (v: CalloutFormValue) => Promise<string>;
  onWithdraw: (id: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const now = Date.now();
  const active = mine.filter((c) => c.status === "active" && Date.parse(c.shift_start_at) + 12 * 3600_000 > now);
  const dept = divisions.find((d) => d.toLowerCase() === (defaultDivision ?? "").toLowerCase()) ?? null;

  return (
    <FullscreenModal open={open} title="Call out" onClose={() => { setDone(null); onClose(); }} footer={null}>
      {active.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>Your call-outs</div>
          {active.map((c) => (
            <div key={c.callout_id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.14)", padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{when(c, tz)}</div>
                <div style={{ fontSize: 12, color: MUTE }}>{c.reason}</div>
              </div>
              {canWithdraw(c, now, false)
                ? <button type="button" style={{ padding: "9px 12px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: "1px solid #fff", background: "transparent", color: "#fff" }} onClick={() => void onWithdraw(c.callout_id)}>Withdraw</button>
                : <span style={{ fontSize: 11, color: MUTE }}>Shift started</span>}
            </div>
          ))}
        </div>
      )}
      {done ? (
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Call-out sent</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{done}</div>
          <button type="button" onClick={() => setDone(null)} style={{ width: "100%", marginTop: 20, padding: "14px 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", cursor: "pointer" }}>Another call-out</button>
        </div>
      ) : (
        <CalloutForm reasons={reasons} divisions={divisions} tz={tz} initial={{ division: dept }} submitLabel="Send call-out" busy={busy}
          onSubmit={async (v) => { setBusy(true); try { setDone(await onCreate(v)); } finally { setBusy(false); } }} />
      )}
    </FullscreenModal>
  );
}
