"use client";
// app/planner/components/trip/BolPagesSheet.tsx
//
// The scanned pages of one BOL number: look at them, remove a bad one, scan a page again (replace), or add pages.
// A BOL is marked up during the trip, so the scans are taken at the end; this is where a bad scan gets redone.

import React, { useCallback, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { CAPTURE_BUCKET } from "@/lib/capture/capture";
import { bolRef } from "@/lib/trips/bols";
import { CaptureSheet } from "../capture/CaptureSheet";

type Page = { captureId: string; path: string; url: string | null };
const MUTE = "rgba(255,255,255,0.55)", HAIR = "rgba(255,255,255,0.14)";
const btn: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", border: `1px solid ${HAIR}`, background: "rgba(0,0,0,0.7)", color: "#fff", cursor: "pointer" };

export function BolPagesSheet({ open, bol, tripId, companyId, userId, onClose, onChanged }: {
  open: boolean; bol: string | null; tripId: string; companyId: string; userId: string; onClose: () => void; onChanged: () => void;
}) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<{ replace: Page | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!bol) return;
    setLoading(true);
    const { data } = await supabase.from("form_captures").select("capture_id, file_paths, created_at").eq("purpose", "bol").eq("ref_id", tripId).eq("ref_type", bolRef(bol)).order("created_at");
    const list: Page[] = [];
    for (const r of (data ?? []) as { capture_id: string; file_paths: string[] | null }[]) {
      for (const path of r.file_paths ?? []) {
        const { data: s } = await supabase.storage.from(CAPTURE_BUCKET).createSignedUrl(path, 3600);
        list.push({ captureId: r.capture_id, path, url: s?.signedUrl ?? null });
      }
    }
    setPages(list); setLoading(false);
  }, [bol, tripId]);
  useEffect(() => { if (open) { setErr(null); void load(); } }, [open, load]);

  // Takes a page out of the capture it came from (the capture row keeps its other pages).
  const removePage = async (p: Page) => {
    setErr(null);
    // The file first: the rule that lets any teammate delete it looks for the page on the capture row.
    await supabase.storage.from(CAPTURE_BUCKET).remove([p.path]);
    const { data } = await supabase.from("form_captures").select("file_paths").eq("capture_id", p.captureId).maybeSingle();
    const rest = ((data as { file_paths: string[] | null } | null)?.file_paths ?? []).filter((x) => x !== p.path);
    const { error } = await supabase.from("form_captures").update({ file_paths: rest, client_updated_at: new Date().toISOString() }).eq("capture_id", p.captureId);
    if (error) { setErr(error.message); return false; }
    return true;
  };

  return (
    <>
      <FullscreenModal open={open && !adding} title={bol ? `BOL ${bol}` : "BOL"} onClose={() => { onChanged(); onClose(); }} footer={null}>
        <div style={{ fontSize: 13, color: MUTE, marginBottom: 12 }}>{loading ? "Loading pages…" : pages.length ? `${pages.length} page${pages.length === 1 ? "" : "s"} scanned.` : "No pages yet."}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {pages.map((p, i) => (
            <div key={p.path} style={{ border: `1px solid ${HAIR}`, background: "#0f0f10" }}>
              <div style={{ aspectRatio: "3 / 4", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {p.url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.url} alt={`Page ${i + 1}`} style={{ maxWidth: "100%", maxHeight: "100%" }} /> : <span style={{ color: "#555", fontSize: 12 }}>No preview</span>}
              </div>
              <div style={{ display: "flex", gap: 6, padding: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 800, flex: 1 }}>Page {i + 1}</span>
                <button type="button" style={btn} onClick={() => setAdding({ replace: p })}>Scan again</button>
                <button type="button" style={{ ...btn, color: "#f87171" }} onClick={async () => { if (await removePage(p)) { onChanged(); void load(); } }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
        <button type="button" onClick={() => setAdding({ replace: null })}
          style={{ width: "100%", marginTop: 14, padding: "15px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>
          {pages.length ? "Scan another page" : "Scan the BOL"}
        </button>
      </FullscreenModal>
      {adding && bol && (
        <CaptureSheet open purpose="bol" title={adding.replace ? `BOL ${bol} · scan again` : `BOL ${bol}`} companyId={companyId} userId={userId} refType={bolRef(bol)} refId={tripId}
          onDone={async () => { if (adding.replace) await removePage(adding.replace); setAdding(null); onChanged(); void load(); }}
          onClose={() => setAdding(null)} />
      )}
    </>
  );
}
