"use client";
// app/planner/components/wallet/TerminalTrainingBack.tsx
//
// The training half of a terminal card's back: the terminal's training and registration links, the
// driver's company letter as a thumbnail, and a Training completed button with the expiration date.
// Training is separate from the card's renewal. Same data as the Locations > Terminals page.

import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { expiresAfterCompletion, trainingModeLabel, trainingStatus } from "@/lib/terminals/training";
import { TRAINING_QUERY_KEY, useTrainingDetail } from "../locations/TerminalTrainingSection";
import { DateField } from "@/lib/ui/DateField";
import { fieldLabel, btnSecondary, btnPrimary } from "../../cards/cardTheme";

const url = (u: string) => (/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
const fmt = (iso: string | null | undefined) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${m}/${d}/${y.slice(2)}`; };
const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; };

function useAccessLinks(terminalId: string) {
  return useQuery({
    queryKey: ["terminalAccessLinks", terminalId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("terminal_access_requirements").select("training_media_url, new_user_url").eq("terminal_id", terminalId).maybeSingle();
      return (data ?? null) as { training_media_url: string | null; new_user_url: string | null } | null;
    },
  });
}

function LetterThumb({ path, name }: { path: string; name: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const isImg = /\.(png|jpe?g|gif|webp|heic)$/i.test(path);
  useEffect(() => {
    let off = false;
    void supabase.storage.from("equipment-docs").createSignedUrl(path, 600).then(({ data }) => { if (!off) setSrc(data?.signedUrl ?? null); });
    return () => { off = true; };
  }, [path]);
  return (
    <button type="button" onClick={() => src && window.open(src, "_blank", "noopener")} aria-label="Open company letter"
      style={{ width: 56, height: 72, flexShrink: 0, borderRadius: 2, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", padding: 0, cursor: src ? "pointer" : "default", overflow: "hidden", color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 800 }}>
      {isImg && src ? <img src={src} alt={name ?? "Company letter"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : "PDF"}
    </button>
  );
}

export function TerminalTrainingBack({ terminalId, userId, companyId }: { terminalId: string; userId: string | null; companyId: string | null }) {
  const qc = useQueryClient();
  const { data } = useTrainingDetail(terminalId, userId, false);
  const links = useAccessLinks(terminalId).data;
  const [dateEdit, setDateEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const req = data?.req ?? null;
  const mine = data?.mine ?? null;
  const letter = data?.letters?.[0] ?? null;
  const status = trainingStatus(req, mine);
  const anyLink = req?.url || links?.training_media_url || links?.new_user_url;
  if (!req?.required && !letter && !anyLink) {
    return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>No training on file for this terminal. Set it up under Locations → Terminals.</div>;
  }

  const save = async (rec: { completed_at: string | null; expires_at: string | null }) => {
    if (!userId) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("driver_terminal_training").upsert({ user_id: userId, terminal_id: terminalId, company_id: companyId, ...rec }, { onConflict: "user_id,terminal_id" });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await qc.invalidateQueries({ queryKey: [TRAINING_QUERY_KEY] });
  };
  const done = () => { const d = today(); void save({ completed_at: d, expires_at: expiresAfterCompletion(d, req?.renewal_months) ?? mine?.expires_at ?? null }); };
  const linkBtn: React.CSSProperties = { ...btnSecondary, textAlign: "left", flex: "1 1 auto" };

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={fieldLabel}>Training{req?.mode ? ` · ${trainingModeLabel(req.mode)}` : ""}{req?.renewal_months ? ` · renews every ${req.renewal_months % 12 === 0 ? `${req.renewal_months / 12} yr` : `${req.renewal_months} mo`}` : ""}</div>
      {(req?.url || links?.training_media_url || links?.new_user_url) && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {req?.url && <button type="button" onClick={() => window.open(url(req.url!), "_blank", "noopener")} style={linkBtn}>Training link ›</button>}
          {links?.training_media_url && <button type="button" onClick={() => window.open(url(links.training_media_url!), "_blank", "noopener")} style={linkBtn}>Video / slides ›</button>}
          {links?.new_user_url && <button type="button" onClick={() => window.open(url(links.new_user_url!), "_blank", "noopener")} style={linkBtn}>Register ›</button>}
        </div>
      )}
      {letter && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LetterThumb path={letter.file_path} name={letter.original_name} />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: "#fff" }}>Company letter</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{letter.original_name ?? "Letter"}</div>
          </div>
        </div>
      )}
      {req?.required && (
        <>
          <div style={{ fontSize: 13, fontWeight: 800, color: status.state === "none" ? "#fff" : EXPIRY_COLOR[status.state] }}>
            {mine?.expires_at ? `Training expires ${fmt(mine.expires_at)} · ${status.text}` : `Training: ${status.text}`}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={busy} onClick={done} style={{ ...btnPrimary, flex: 1 }}>Training completed</button>
            <button type="button" onClick={() => setDateEdit(mine?.expires_at ?? "")} style={{ ...btnSecondary, flex: 1 }}>Set expiration date</button>
          </div>
          {dateEdit != null && (
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1 }}><DateField value={dateEdit} onChange={setDateEdit} title="Training expires" placeholder="Pick a date" allowClear={false} /></div>
              <button type="button" disabled={!dateEdit || busy} onClick={() => { void save({ completed_at: mine?.completed_at ?? null, expires_at: dateEdit }).then(() => setDateEdit(null)); }} style={btnSecondary}>Save</button>
            </div>
          )}
        </>
      )}
      {err && <div style={{ fontSize: 12, color: "#f87171" }}>{err}</div>}
    </div>
  );
}
