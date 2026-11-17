"use client";
// app/superadmin/SuperSquawkModal.tsx
//
// ProTankr's own Squawk: the inbox of everyone's comments to "Seth" (one thread per user), replies, a company-wide post
// to any company you pick, and a settings link for how long these messages are kept. Messages sent from here read
// "SP - ProTankr" to everyone, whichever company is looking.

import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { supabase } from "@/lib/supabase/client";
import { useSquawkFeed } from "@/lib/squawk/useSquawk";
import { SUPPORT_NAME, MAX_BODY } from "@/lib/squawk/squawk";

export type Thread = { user_id: string; user_name: string; company_name: string; last_body: string; last_at: string; last_from_admin: boolean; unread: number };

/** The inbox, polled once a minute (and refreshed whenever a Squawk message arrives). */
export function useSupportInbox(enabled: boolean) {
  const q = useQuery({
    queryKey: ["squawk", "support", "threads"], enabled, staleTime: 30_000, refetchInterval: 60_000, retry: 0,
    queryFn: async (): Promise<Thread[]> => {
      const { data, error } = await supabase.rpc("support_threads");
      return error ? [] : ((data ?? []) as Thread[]).map((t) => ({ ...t, unread: Number(t.unread) }));
    },
  });
  const threads = q.data ?? [];
  return { threads, unread: threads.reduce((n, t) => n + t.unread, 0) };
}

const muted = "rgba(255,255,255,0.5)", hair = "rgba(255,255,255,0.14)";
const dark: React.CSSProperties = { display: "block", width: "100%", padding: "13px 16px", borderRadius: 2, border: `1px solid ${hair}`, background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const white: React.CSSProperties = { display: "block", width: "100%", padding: "13px 16px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 900, fontSize: 14, cursor: "pointer" };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: `1px solid ${hair}`, borderRadius: 2, fontFamily: "inherit" };
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

function ThreadView({ uid, name, company, adminId, open }: { uid: string; name: string; company: string; adminId: string; open: boolean }) {
  const feed = useSquawkFeed("support", uid, open, adminId);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [feed.messages.length]);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true); setErr(null);
    const e = await feed.send(body.trim(), []);
    setBusy(false);
    if (e) setErr(e); else setBody("");
  };
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{name}</div>
      <div style={{ fontSize: 12, color: muted, marginBottom: 12 }}>{company}</div>
      {feed.messages.length === 0 && !feed.loading && <div style={{ fontSize: 14, color: muted }}>No messages.</div>}
      {feed.messages.map((m) => {
        const mine = !!m.mine;
        return (
          <div key={m.id} style={{ marginBottom: 10, display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 2 }}>{mine ? "You (SP - ProTankr)" : name} · {new Date(m.created_at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            <div style={{ maxWidth: "88%", padding: "9px 12px", background: mine ? "#fff" : "#1a1a1c", color: mine ? "#000" : "#fff", border: `1px solid ${hair}`, fontSize: 15, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{m.body}</div>
          </div>
        );
      })}
      <div ref={end} />
      <textarea value={body} rows={2} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} placeholder={`Reply to ${name}…`} style={{ ...field, resize: "none", marginTop: 8 }} />
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 4 }}>{err}</div>}
      <button type="button" onClick={() => void send()} disabled={busy || !body.trim()} aria-busy={busy} style={{ ...white, marginTop: 8, opacity: busy || !body.trim() ? 0.5 : 1 }}>{busy ? "Sending…" : "Reply"}</button>
    </div>
  );
}

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 10, 14, 15, 21, 30, 45, 60, 90].map((n) => ({ value: String(n), label: String(n) }));
const UNITS = [{ value: "hours", label: "Hours" }, { value: "days", label: "Days" }, { value: "weeks", label: "Weeks" }, { value: "months", label: "Months" }, { value: "never", label: "Never" }];

function Settings({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState("days");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void supabase.from("platform_settings").select("value").eq("key", "squawk_support").maybeSingle().then((r) => {
      const v = (r.data?.value ?? {}) as { amount?: number; unit?: string };
      if (v.unit) setUnit(v.unit); if (v.amount) setAmount(String(v.amount));
    });
  }, []);
  const save = async () => {
    const { error } = await supabase.from("platform_settings").upsert({ key: "squawk_support", value: { amount: Number(amount), unit }, updated_at: new Date().toISOString() });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
  };
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>{SUPPORT_NAME} channel settings</div>
      <div style={{ fontSize: 13, color: muted, margin: "6px 0 14px" }}>How long comments and replies are kept. It applies to every message already there too, and expired ones are deleted within about five minutes.</div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>Keep messages for</div>
      <div style={{ display: "flex", gap: 8 }}>
        {unit !== "never" && <div style={{ width: 110 }}><CustomSelect value={amount} onChange={setAmount} options={NUMBERS} /></div>}
        <div style={{ flex: 1 }}><CustomSelect value={unit} onChange={setUnit} options={UNITS} /></div>
      </div>
      {msg && <div style={{ fontSize: 13, marginTop: 10, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
      <button type="button" onClick={() => void save()} style={{ ...white, marginTop: 14 }}>Save</button>
      <button type="button" onClick={onDone} style={{ ...dark, marginTop: 10 }}>Back</button>
    </div>
  );
}

function CompanyPost({ companies }: { companies: { company_id: string; company_name: string }[] }) {
  const [co, setCo] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const send = async () => {
    if (!co) return setMsg({ ok: false, text: "Pick a company." });
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("squawk_send", { p_type: "company", p_key: co, p_body: body.trim(), p_attachments: [] });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setBody(""); setMsg({ ok: true, text: `Sent to ${companies.find((c) => c.company_id === co)?.company_name ?? "the company"} as SP - ProTankr.` });
  };
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 900 }}>Company wide</div>
      <div style={{ fontSize: 13, color: muted, margin: "6px 0 14px" }}>Everyone in the company you pick sees it, from "SP - ProTankr".</div>
      <CustomSelect value={co} onChange={setCo} options={[{ value: "", label: "Pick a company" }, ...companies.map((c) => ({ value: c.company_id, label: c.company_name }))]} />
      <textarea value={body} rows={4} maxLength={MAX_BODY} onChange={(e) => setBody(e.target.value)} placeholder="Message" style={{ ...field, resize: "none", marginTop: 10 }} />
      {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
      <button type="button" onClick={() => void send()} disabled={busy || !body.trim()} aria-busy={busy} style={{ ...white, marginTop: 10, opacity: busy || !body.trim() ? 0.5 : 1 }}>{busy ? "Sending…" : "Send to the company"}</button>
    </div>
  );
}

export default function SuperSquawkModal({ open, onClose, companies, adminId }: { open: boolean; onClose: () => void; companies: { company_id: string; company_name: string }[]; adminId: string }) {
  const qc = useQueryClient();
  const { threads } = useSupportInbox(open);
  const [tab, setTab] = useState<"inbox" | "company">("inbox");
  const [thread, setThread] = useState<Thread | null>(null);
  const [settings, setSettings] = useState(false);
  useEffect(() => { if (!open) { setThread(null); setSettings(false); setTab("inbox"); } }, [open]);
  const back = () => { setThread(null); void qc.invalidateQueries({ queryKey: ["squawk"] }); };
  return (
    <FullscreenModal open={open} onClose={thread || settings ? () => (thread ? back() : setSettings(false)) : onClose} title={`Squawk · ${SUPPORT_NAME}`} footer={null}
      headerRight={!thread && !settings ? <button type="button" onClick={() => setSettings(true)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Settings</button> : undefined}>
      {settings ? <Settings onDone={() => setSettings(false)} />
        : thread ? <ThreadView uid={thread.user_id} name={thread.user_name} company={thread.company_name} adminId={adminId} open={open} />
        : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {(["inbox", "company"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} style={{ ...dark, flex: 1, marginTop: 0, background: tab === t ? "#fff" : "rgba(255,255,255,0.06)", color: tab === t ? "#000" : "#fff" }}>{t === "inbox" ? "Inbox" : "Company wide"}</button>
              ))}
            </div>
            {tab === "company" ? <CompanyPost companies={companies} /> : (
              <>
                {threads.length === 0 && <div style={{ fontSize: 14, color: muted }}>Nothing yet. When anyone sends a comment to {SUPPORT_NAME} it lands here.</div>}
                {threads.map((t) => (
                  <button key={t.user_id} type="button" onClick={() => setThread(t)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, border: `1px solid ${t.unread ? "#60a5fa" : hair}`, background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 900 }}>{t.user_name}</span>
                      <span style={{ fontSize: 12, color: muted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.company_name}</span>
                      {t.unread > 0 && <span style={{ background: "#60a5fa", color: "#000", fontSize: 11, fontWeight: 900, padding: "1px 7px", borderRadius: 10 }}>{t.unread}</span>}
                      <span style={{ fontSize: 12, color: muted }}>{ago(t.last_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last_from_admin ? "You: " : ""}{t.last_body}</div>
                  </button>
                ))}
              </>
            )}
          </>
        )}
    </FullscreenModal>
  );
}
