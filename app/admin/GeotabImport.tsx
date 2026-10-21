"use client";
// app/admin/GeotabImport.tsx
//
// "Add from Geotab": the vehicles and trailers Geotab has that we don't. Built for big fleets:
// collapsed by default, searchable, filtered by Geotab group, nothing ticked until chosen, and
// added in batches. Shows the first 100 matches; narrow with search or a group to reach the rest.

import React, { useMemo, useState } from "react";

type Unit = { id: string; name: string; vin?: string | null; plate?: string | null; group?: string };
const muted = "rgba(255,255,255,0.5)";
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 15, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const link: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 };
const SHOW = 100;
const BATCH = 150;

export default function GeotabImport({ vehicles, trailers, add }: {
  vehicles: Unit[]; trailers: Unit[];
  /** Sends one batch of provider ids; resolves false on an error (already shown by the caller). */
  add: (kind: "vehicles" | "trailers", ids: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"vehicles" | "trailers">(vehicles.length || !trailers.length ? "vehicles" : "trailers");
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);

  const rows = kind === "vehicles" ? vehicles : trailers;
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group ?? "Whole company"))].sort(), [rows]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (!grp || (r.group ?? "Whole company") === grp) && (!t || `${r.name} ${r.vin ?? ""} ${r.plate ?? ""}`.toLowerCase().includes(t)));
  }, [rows, q, grp]);
  const picked = matches.filter((r) => chosen.has(r.id));
  const allChosen = rows.filter((r) => chosen.has(r.id)).map((r) => r.id);

  const toggle = (id: string) => setChosen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const go = async () => {
    const ids = allChosen;
    for (let i = 0; i < ids.length; i += BATCH) {
      setProgress(`Adding ${Math.min(i + BATCH, ids.length)} of ${ids.length}…`);
      if (!(await add(kind, ids.slice(i, i + BATCH)))) { setProgress(null); return; }
    }
    setProgress(null);
    setChosen(new Set());
  };

  const total = vehicles.length + trailers.length;
  if (!total) return null;
  return (
    <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...link, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff" }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Add from Geotab · {vehicles.length.toLocaleString()} trucks · {trailers.length.toLocaleString()} trailers</span>
        <span style={{ color: muted }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: muted, marginBottom: 8, lineHeight: 1.5 }}>
            In Geotab but not in your equipment. Nothing is ticked: search or pick a group, tick what you want, then add. Adding creates the truck or trailer (VIN, plate, year, make and model where known) and links it.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {(["vehicles", "trailers"] as const).map((k) => (
              <button key={k} type="button" onClick={() => { setKind(k); setQ(""); setGrp(""); }}
                style={{ ...btn, flex: 1, background: kind === k ? "#fff" : "transparent", color: kind === k ? "#000" : "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
                {k === "vehicles" ? `Trucks (${vehicles.length.toLocaleString()})` : `Trailers (${trailers.length.toLocaleString()})`}
              </button>
            ))}
          </div>
          <input style={input} placeholder="Search unit number, VIN or plate" value={q} onChange={(e) => setQ(e.target.value)} />
          {groups.length > 1 && (
            <select style={{ ...input, marginTop: 8 }} value={grp} onChange={(e) => setGrp(e.target.value)}>
              <option value="">All groups ({groups.length})</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px", fontSize: 12, color: muted }}>
            <span>{matches.length.toLocaleString()} match{matches.length === 1 ? "" : "es"}{matches.length > SHOW ? ` · showing ${SHOW}` : ""}</span>
            <span style={{ display: "flex", gap: 12 }}>
              <button type="button" style={link} onClick={() => setChosen((p) => new Set([...p, ...matches.map((m) => m.id)]))}>Tick all {matches.length.toLocaleString()}</button>
              <button type="button" style={link} onClick={() => setChosen(new Set())}>Clear</button>
            </span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {matches.slice(0, SHOW).map((x) => (
              <label key={x.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 14, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <input type="checkbox" checked={chosen.has(x.id)} onChange={() => toggle(x.id)} />
                <span style={{ fontWeight: 700 }}>{x.name}</span>
                <span style={{ color: muted, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[x.group && x.group !== "Whole company" ? x.group : null, x.vin, x.plate].filter(Boolean).join(" · ")}
                </span>
              </label>
            ))}
          </div>
          <button type="button" style={{ ...btn, width: "100%", marginTop: 10, opacity: allChosen.length && !progress ? 1 : 0.5 }} disabled={!allChosen.length || !!progress} onClick={() => void go()}>
            {progress ?? `Add ${allChosen.length.toLocaleString()} ${kind === "vehicles" ? "truck" : "trailer"}${allChosen.length === 1 ? "" : "s"}${picked.length !== allChosen.length ? " (incl. other searches)" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
