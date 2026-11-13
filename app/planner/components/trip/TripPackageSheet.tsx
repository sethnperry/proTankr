"use client";
// app/planner/components/trip/TripPackageSheet.tsx
//
// The last step when a trip closes: email the trip package (cover, PTD, BOLs, receipts). It says plainly whether the
// driver's automatic copy is on, so they don't send themselves a second email: with it on, their own copy is already
// on its way and this sheet only sends to other people.

import React, { useEffect, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { sendTripPackage } from "@/lib/trips/useTripPackagePrefs";

const MUTE = "rgba(255,255,255,0.55)", HAIR = "rgba(255,255,255,0.14)";
const btn = (primary: boolean): React.CSSProperties => ({ width: "100%", padding: "15px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer", marginTop: 10, border: primary ? "none" : `1px solid ${HAIR}`, background: primary ? "#fff" : "transparent", color: primary ? "#000" : "#fff" });
const EXTRA_KEY = "proTankr:packageExtraEmails";

export function TripPackageSheet({ open, tripId, orderNumber, myEmail, autoOn, onClose }: {
  open: boolean; tripId: string | null; orderNumber: string | null; myEmail: string | null; autoOn: boolean | null; onClose: () => void;
}) {
  const [autoState, setAutoState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [autoErr, setAutoErr] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const autoFor = useRef<string | null>(null);

  useEffect(() => { try { setExtra(localStorage.getItem(EXTRA_KEY) ?? ""); } catch { /* storage blocked */ } }, []);
  useEffect(() => { if (!open) { setMsg(null); setBusy(false); } }, [open]);

  // Automatic copy: sent once for this trip, as soon as the sheet knows the switch is on.
  useEffect(() => {
    if (!open || !tripId || autoOn !== true || autoFor.current === tripId) return;
    autoFor.current = tripId;
    setAutoState("sending"); setAutoErr(null);
    void sendTripPackage(tripId, "auto").then((r) => {
      if (r.ok) setAutoState("sent"); else { setAutoState("failed"); setAutoErr(r.error); autoFor.current = null; }
    });
  }, [open, tripId, autoOn]);

  const typed = extra.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const send = async (toMe: boolean) => {
    if (!tripId) return;
    const list = [...(toMe && myEmail ? [myEmail] : []), ...typed.filter((x) => x.toLowerCase() !== (autoOn ? (myEmail ?? "").toLowerCase() : ""))];
    const uniq = [...new Map(list.map((x) => [x.toLowerCase(), x])).values()];
    if (!uniq.length) return setMsg({ ok: false, text: "Enter an email address." });
    setBusy(true); setMsg(null);
    const r = await sendTripPackage(tripId, "manual", uniq);
    setBusy(false);
    if (r.ok) { try { localStorage.setItem(EXTRA_KEY, typed.join(", ")); } catch { /* storage blocked */ } setMsg({ ok: true, text: `Sent to ${(r.to ?? uniq).join(", ")}.` }); }
    else setMsg({ ok: false, text: r.error });
  };

  return (
    <FullscreenModal open={open} title="Trip package" onClose={onClose} footer={null}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{orderNumber ? `Order ${orderNumber} is done.` : "Trip done."}</div>
      <div style={{ fontSize: 14, color: MUTE, marginTop: 6 }}>One PDF: cover with everything you collected, the PTD, BOLs, then receipts and tickets.</div>

      <div style={{ marginTop: 16, padding: 12, border: `1px solid ${autoOn ? "rgba(74,222,128,0.5)" : HAIR}`, background: "#0f0f10" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: autoOn ? "#4ade80" : "rgba(255,255,255,0.8)" }}>
          Automatic copy to you is {autoOn == null ? "…" : autoOn ? "ON" : "OFF"}
        </div>
        <div style={{ fontSize: 13, color: MUTE, marginTop: 4 }}>
          {autoOn
            ? autoState === "sending" ? `Sending your copy to ${myEmail ?? "your email"}…`
              : autoState === "sent" ? `Your copy was sent to ${myEmail ?? "your email"}. You don't need to send it to yourself.`
              : autoState === "failed" ? `Couldn't send your copy: ${autoErr}` : "Your copy is on its way."
            : "Nothing is sent unless you do it below. You can turn on automatic copies in Settings."}
        </div>
        {autoOn && autoState === "failed" && (
          <button type="button" style={{ ...btn(false), marginTop: 8, padding: "10px 0" }} onClick={() => { autoFor.current = null; setAutoState("idle"); setAutoErr(null); setAutoState("sending"); void sendTripPackage(tripId!, "auto").then((r) => { if (r.ok) setAutoState("sent"); else { setAutoState("failed"); setAutoErr(r.error); } }); }}>Try again</button>
        )}
      </div>

      {!autoOn && myEmail && (
        <button type="button" style={btn(true)} disabled={busy} aria-busy={busy} onClick={() => void send(true)}>{busy ? "Sending…" : `Email to me (${myEmail})`}</button>
      )}

      <div style={{ marginTop: 18, fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE }}>{autoOn ? "Send to someone else" : "Also send to"} (up to 3)</div>
      <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="dispatch@company.com, billing@company.com" inputMode="email" autoCapitalize="none"
        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, background: "#0a0a0b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, padding: "12px", borderRadius: 0 }} />
      <button type="button" style={btn(false)} disabled={busy || typed.length === 0} aria-busy={busy} onClick={() => void send(false)}>{busy ? "Sending…" : autoOn ? "Send to them" : "Send to these"}</button>
      {msg && <div style={{ marginTop: 10, fontSize: 14, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
      <button type="button" style={btn(false)} onClick={onClose}>{msg?.ok || autoState === "sent" ? "Done" : "Skip"}</button>
    </FullscreenModal>
  );
}
