"use client";
// app/planner/components/site/SiteNotes.tsx
//
// The one notes component for terminals and drop sites. "edit": a text box that saves when the driver leaves it.
// "read": the text, nothing to change. Used in the Locations tool, both arrival windows (edit) and the dashboard
// pop-out (read). Notes belong to the place, so every driver who goes there sees the same ones.

import React, { useEffect, useRef, useState } from "react";
import { useSiteAverage, useSiteNote, type SiteKind } from "@/lib/sites/useSites";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";

export function SiteNotes({ kind, id, mode, userId, showAttribution = false, label }: {
  kind: SiteKind; id: string | null; mode: "edit" | "read"; userId?: string | null; showAttribution?: boolean; label?: string;
}) {
  const { note, loading, save } = useSiteNote(kind, id);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (note && seeded.current !== `${id}:${note.updatedAt ?? ""}:${note.note}`) { seeded.current = `${id}:${note.updatedAt ?? ""}:${note.note}`; setDraft(note.note); }
  }, [note, id]);

  if (!id) return null;
  const title = label ?? (kind === "terminal" ? "Terminal notes" : "Drop site notes");
  const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
  const attribution = showAttribution && note?.updatedAt
    ? `Last edited ${note.updatedByName ? `by ${note.updatedByName} ` : ""}${new Date(note.updatedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })}`
    : null;

  if (mode === "read") {
    return (
      <div style={{ padding: "12px 14px", background: "#0f0f10", border: `1px solid ${hair}` }}>
        <div style={cap}>{title}</div>
        <div style={{ fontSize: 15, marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.45, color: note?.note ? "#fff" : muted }}>{loading ? "Loading…" : note?.note || "No notes yet."}</div>
        {attribution && <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>{attribution}</div>}
      </div>
    );
  }
  const dirty = draft.trim() !== (note?.note ?? "").trim();
  const commit = async () => {
    if (!dirty || !userId || busy) return;
    setBusy(true); setErr(null); setSaved(false);
    const e = await save(draft, userId);
    setBusy(false);
    if (e) setErr(e); else setSaved(true);
  };
  return (
    <div style={{ padding: "12px 14px", background: "#0f0f10", border: `1px solid ${hair}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ ...cap, flex: 1 }}>{title}</span>
        {busy ? <span style={{ fontSize: 11, color: muted }}>Saving…</span> : saved && !dirty ? <span style={{ fontSize: 11, color: "#4ade80" }}>Saved</span> : null}
      </div>
      <textarea value={draft} rows={3} onChange={(e) => { setDraft(e.target.value); setSaved(false); }} onBlur={() => void commit()}
        placeholder={kind === "terminal" ? "Where to pull up, how the rack runs, anything to know before you go in…" : "Gate code, where the fills are, anything to know before you get out…"}
        style={{ width: "100%", boxSizing: "border-box", marginTop: 6, padding: "10px 12px", fontSize: 15, color: "#fff", background: "rgba(255,255,255,0.05)", border: `1px solid ${hair}`, borderRadius: 2, resize: "vertical", fontFamily: "inherit" }} />
      {kind === "location" && <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>Shared with every company that delivers here.</div>}
      {dirty && <button type="button" onClick={() => void commit()} disabled={busy} style={{ marginTop: 8, padding: "9px 14px", fontSize: 13, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}>Save notes</button>}
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>}
      {attribution && <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>{attribution}</div>}
    </div>
  );
}

/** Average time at a site, fetched here so it can sit anywhere. */
export function SiteAverage({ kind, id }: { kind: SiteKind; id: string | null }) {
  const m = useSiteAverage(kind, id);
  return <AverageTime kind={kind} minutes={m} />;
}

/** "Avg load time 42 min" / "Avg drop time 31 min"; nothing until there are enough visits. */
export function AverageTime({ kind, minutes }: { kind: SiteKind; minutes: number | null }) {
  if (minutes == null) return null;
  return <span style={{ fontSize: 13, color: muted }}>avg {kind === "terminal" ? "load" : "drop"} time <b className="dash-num" style={{ color: "#fff" }}>{minutes} min</b></span>;
}

/** The permanent line above Begin: the SOP for when to tap it. */
export function SopLine({ text }: { text: string }) {
  return <div style={{ padding: "10px 12px", border: "1px solid rgba(251,191,36,0.45)", background: "rgba(251,191,36,0.08)", fontSize: 14, fontWeight: 700, color: "#fde68a", marginBottom: 8 }}>{text}</div>;
}
