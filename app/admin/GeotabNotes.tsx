"use client";
// app/admin/GeotabNotes.tsx
//
// Read-only peek at the free-text comment and custom fields on every Geotab vehicle and trailer.
// Loaded on demand (thousands of units), nothing is copied anywhere. Use it to see whether your
// company keeps useful data there (compartments, tank sizes, notes) before deciding to import it.

import React, { useMemo, useState } from "react";

export type NotesPeek = {
  total: number; withData: number; withComment: number;
  fields: { name: string; count: number }[];
  rows: { kind: "truck" | "trailer"; id: string; name: string; comment: string | null; props: { name: string; value: string }[] }[];
};
const muted = "rgba(255,255,255,0.5)";
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const link: React.CSSProperties = { border: "none", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 };
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 15, boxSizing: "border-box" };
const SHOW = 60;

export default function GeotabNotes({ load, busy }: { load: () => Promise<NotesPeek | null>; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [peek, setPeek] = useState<NotesPeek | null>(null);
  const [q, setQ] = useState("");
  const [field, setField] = useState("");
  const [loading, setLoading] = useState(false);

  const rows = useMemo(() => {
    if (!peek) return [];
    const t = q.trim().toLowerCase();
    return peek.rows.filter((r) =>
      (!field || (field === "__comment" ? !!r.comment : r.props.some((p) => p.name === field))) &&
      (!t || `${r.name} ${r.comment ?? ""} ${r.props.map((p) => `${p.name} ${p.value}`).join(" ")}`.toLowerCase().includes(t)));
  }, [peek, q, field]);

  const go = async () => { setLoading(true); try { setPeek(await load()); } finally { setLoading(false); } };
  return (
    <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...link, width: "100%", display: "flex", justifyContent: "space-between" }}>
        <span>Notes &amp; custom fields in Geotab{peek ? ` · ${peek.withData.toLocaleString()} of ${peek.total.toLocaleString()} units have some` : ""}</span>
        <span style={{ color: muted }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8, lineHeight: 1.5 }}>
            Read-only. Shows each vehicle's and trailer's comment and any custom fields your Geotab account has filled in. Nothing is copied into ProTankr.
          </div>
          {!peek ? (
            <button type="button" style={{ ...btn, width: "100%", opacity: loading || busy ? 0.5 : 1 }} disabled={loading || busy} aria-busy={loading} onClick={() => void go()}>
              {loading ? "Reading Geotab…" : "Look at my Geotab notes"}
            </button>
          ) : peek.withData === 0 ? (
            <div style={{ fontSize: 14 }}>No comments or custom fields are filled in on any of your {peek.total.toLocaleString()} units, so there's nothing to bring over.</div>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                {peek.withComment.toLocaleString()} with a comment
                {peek.fields.map((f) => ` · ${f.count.toLocaleString()} with "${f.name}"`).join("")}
              </div>
              <input style={input} placeholder="Search units, comments or values" value={q} onChange={(e) => setQ(e.target.value)} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
                {[{ k: "", l: "All" }, ...(peek.withComment ? [{ k: "__comment", l: "Comment" }] : []), ...peek.fields.map((f) => ({ k: f.name, l: f.name }))].map((c) => (
                  <button key={c.k} type="button" onClick={() => setField(c.k)}
                    style={{ ...btn, padding: "6px 10px", fontSize: 12, background: field === c.k ? "#fff" : "transparent", color: field === c.k ? "#000" : "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>{c.l}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>
                {rows.length.toLocaleString()} match{rows.length === 1 ? "" : "es"}{rows.length > SHOW ? ` · showing ${SHOW}` : ""}
                {peek.withData > peek.rows.length ? ` · the first ${peek.rows.length} units with data were loaded` : ""}
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                {rows.slice(0, SHOW).map((r) => (
                  <div key={`${r.kind}${r.id}`} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{r.name} <span style={{ fontSize: 11, color: muted, fontWeight: 600 }}>{r.kind}</span></div>
                    {r.comment && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{r.comment}</div>}
                    {r.props.map((p) => <div key={p.name} style={{ fontSize: 12, color: muted }}>{p.name}: <span style={{ color: "#fff" }}>{p.value}</span></div>)}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
