"use client";
// app/planner/components/squawk/SquawkSheet.tsx
//
// Squawk: a radio-style board. The channel is picked in the header, the keyboard is up the moment the window opens
// (the device keyboard's own talk-to-text does the dictating), and a message goes to the selected channel only. The
// sender shows as a truck number, never a name. Reuses the document sheet's camera button for photos.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PickSheet } from "@/lib/ui/PickSheet";
import { CameraButton } from "../equipment/AddDocumentSheet";
import { ATTACHMENT_NOTICE, MAX_ATTACHMENTS, MAX_BODY, availableChannels, cityLabel, hasAttachments, isCityType, senderLabel, type SquawkCtx, type SquawkType } from "@/lib/squawk/squawk";
import { signedUrl, useSquawkFeed } from "@/lib/squawk/useSquawk";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function SquawkSheet({ open, onClose, userId, ctx, initialType, cityOptions, onCity }: {
  open: boolean; onClose: () => void; userId: string | null; ctx: SquawkCtx;
  /** The channel to open on (from the dashboard alert); else the first one the driver is in. */
  initialType?: SquawkType | null;
  /** "Tampa, FL" choices for the city channels, and what to do when one is picked. */
  cityOptions: { value: string; label: string }[];
  onCity: (value: string) => void;
}) {
  const channels = useMemo(() => availableChannels(ctx), [ctx]);
  const [type, setType] = useState<SquawkType | null>(null);
  const [pickCh, setPickCh] = useState(false);
  const [pickCity, setPickCity] = useState(false);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  // Open on the channel asked for, else the first the driver is in; closed channels can't be selected.
  useEffect(() => {
    if (!open) return;
    const want = initialType && channels.find((c) => c.type === initialType && c.key) ? initialType : channels.find((c) => c.key)?.type ?? null;
    setType((t) => (t && channels.find((c) => c.type === t && c.key) && !initialType ? t : want));
    setErr(null);
    window.setTimeout(() => box.current?.focus(), 150); // the keyboard is up as the window opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialType]);
  const ch = channels.find((c) => c.type === type) ?? null;
  const feed = useSquawkFeed(ch?.type ?? null, ch?.key ?? null, open, userId);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [feed.messages.length, open]);

  const send = async () => {
    if (busy || (!body.trim() && files.length === 0)) return;
    setBusy(true); setErr(null);
    const e = await feed.send(body, files);
    setBusy(false);
    if (e) { setErr(e); return; }
    setBody(""); setFiles([]);
    box.current?.focus();
  };
  const city = cityLabel(ctx);

  return (
    <>
      <FullscreenModal open={open} onClose={onClose} title="Squawk" footer={null}>
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 10 }}>
            <button type="button" onClick={() => setPickCh(true)} style={{ flex: 1, textAlign: "left", padding: "10px 12px", background: "#0f0f10", border: `1px solid ${hair}`, color: "#fff", cursor: "pointer" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>Channel</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{ch?.label ?? "Pick a channel"} <span style={{ color: muted }}>›</span></div>
            </button>
            {ch && isCityType(ch.type) && (
              <button type="button" onClick={() => setPickCity(true)} style={{ padding: "10px 12px", background: "#0f0f10", border: `1px solid ${hair}`, color: "#fff", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>City</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{city ?? "Pick"} <span style={{ color: muted }}>›</span></div>
              </button>
            )}
          </div>
          {ch && <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>{ch.hint}</div>}

          <div style={{ flex: 1, minHeight: 120 }}>
            {!ch?.key && <div style={{ color: muted, fontSize: 14, padding: "12px 0" }}>{ch?.why ?? "Pick a channel."}</div>}
            {ch?.key && feed.messages.length === 0 && !feed.loading && <div style={{ color: muted, fontSize: 14, padding: "12px 0" }}>Quiet. Messages here disappear on their own.</div>}
            {feed.messages.map((m) => (
              <div key={m.id} style={{ marginBottom: 10, display: "flex", flexDirection: "column", alignItems: m.mine ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 2 }}>{m.mine ? "You" : senderLabel(m, ctx.companyId ?? null)} · {time(m.created_at)}</div>
                <div style={{ maxWidth: "86%", padding: "9px 12px", background: m.mine ? "#fff" : "#1a1a1c", color: m.mine ? "#000" : "#fff", border: `1px solid ${hair}`, fontSize: 15, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                  {m.body}
                  {m.attachments.map((a) => <AttachmentChip key={a.path} a={a} dark={!!m.mine} />)}
                </div>
                {m.mine && <button type="button" onClick={() => void feed.retract(m.id)} style={{ border: "none", background: "none", color: muted, fontSize: 11, cursor: "pointer", padding: "2px 0" }}>Retract</button>}
                {hasAttachments(m) && <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 3, maxWidth: "86%" }}>{ATTACHMENT_NOTICE}</div>}
              </div>
            ))}
            <div ref={end} />
          </div>

          {ch?.key && (
            <div style={{ position: "sticky", bottom: 0, background: "#0b0b0b", paddingTop: 8, borderTop: `1px solid ${hair}` }}>
              {files.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                  {files.map((f, i) => (
                    <span key={i} style={{ fontSize: 12, padding: "4px 8px", border: `1px solid ${hair}` }}>{f.name.slice(0, 24)} <button type="button" aria-label="Remove" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: muted, cursor: "pointer" }}>✕</button></span>
                  ))}
                </div>
              )}
              <textarea ref={box} value={body} rows={2} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} placeholder="Squawk…" autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: `1px solid ${hair}`, borderRadius: 2, resize: "none", fontFamily: "inherit" }} />
              {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 4 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {files.length < MAX_ATTACHMENTS && (
                  <>
                    <CameraButton multiple onFile={(f) => setFiles((x) => [...x, ...f].slice(0, MAX_ATTACHMENTS))} style={{ padding: "12px 14px", fontSize: 13, fontWeight: 800, border: `1px solid ${hair}`, color: "#fff" }}>Photo</CameraButton>
                    <label style={{ padding: "12px 14px", fontSize: 13, fontWeight: 800, border: `1px solid ${hair}`, color: "#fff", cursor: "pointer" }}>
                      File<input type="file" multiple style={{ display: "none" }} onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) setFiles((x) => [...x, ...f].slice(0, MAX_ATTACHMENTS)); e.target.value = ""; }} />
                    </label>
                  </>
                )}
                <button type="button" onClick={() => void send()} disabled={busy || (!body.trim() && files.length === 0)} aria-busy={busy}
                  style={{ flex: 1, padding: "12px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", background: "#fff", color: "#000", border: "none", cursor: "pointer", opacity: busy || (!body.trim() && files.length === 0) ? 0.5 : 1 }}>
                  {busy ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </FullscreenModal>
      <PickSheet open={pickCh} title="Channel" options={channels.map((c) => ({ value: c.type, label: c.key ? c.label : `${c.label} · ${c.why}` }))} value={type ?? ""} onPick={(v) => { const c = channels.find((x) => x.type === v); if (c?.key) setType(c.type); else if (c && isCityType(c.type)) { setType(c.type); setPickCity(true); } setPickCh(false); }} onClose={() => setPickCh(false)} />
      <PickSheet open={pickCity} title="City" options={cityOptions} value="" onPick={(v) => { onCity(v); setPickCity(false); }} onClose={() => setPickCity(false)} />
    </>
  );
}

function AttachmentChip({ a, dark }: { a: { path: string; name: string; type: string }; dark: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" onClick={async () => { setBusy(true); const u = await signedUrl(a.path); setBusy(false); if (u) window.open(u, "_blank", "noopener"); }}
      style={{ display: "block", marginTop: 6, padding: "6px 8px", fontSize: 13, fontWeight: 700, border: `1px solid ${dark ? "rgba(0,0,0,0.3)" : hair}`, background: "transparent", color: dark ? "#000" : "#fff", cursor: "pointer", textAlign: "left" }}>
      {busy ? "Opening…" : `${a.type.startsWith("image/") ? "Photo" : "File"}: ${a.name.slice(0, 28)} ›`}
    </button>
  );
}
