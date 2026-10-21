"use client";
// app/admin/GeotabImport.tsx
//
// "Add from Geotab": bring Geotab's vehicles and trailers in, and keep fields in step. Built for big
// fleets: collapsed by default, searchable, filtered by Geotab group, nothing ticked until chosen,
// added in batches. You choose which fields to bring over and what to do with units you already have
// (skip, fill blanks, or overwrite). The same choices re-apply to units already linked.

import React, { useMemo, useState } from "react";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { WHOLE_COMPANY } from "@/lib/telematics/groups";
import { DEFAULT_OPTS, type SyncOpts } from "@/lib/telematics/unitSync";

type Unit = { id: string; name: string; vin?: string | null; plate?: string | null; group?: string; groups?: string[] };
export type ImportResult = { added: number; linked: number; updated: number };
const muted = "rgba(255,255,255,0.5)";
const input: React.CSSProperties = { width: "100%", padding: "9px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 15, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const link: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 };
const lab: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 4px" };
const SHOW = 100;
const BATCH = 150;

export default function GeotabImport({ vehicles, trailers, linkedTrailers = [], linkedTrucks, add, syncLinked, note }: {
  vehicles: Unit[]; trailers: Unit[]; linkedTrailers?: (Unit & { linkedTo?: string | null })[]; linkedTrucks: number;
  /** Sends one batch of provider ids; resolves null on an error (already shown by the caller). */
  add: (kind: "vehicles" | "trailers", ids: string[], opts: SyncOpts) => Promise<ImportResult | null>;
  syncLinked: (opts: SyncOpts) => Promise<ImportResult | null>;
  note: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"vehicles" | "trailers">(vehicles.length || !trailers.length ? "vehicles" : "trailers");
  const [q, setQ] = useState("");
  const [grp, setGrp] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [opts, setOpts] = useState<SyncOpts>({ ...DEFAULT_OPTS, existing: "fill" });
  const setField = (k: keyof SyncOpts["fields"], v: boolean) => setOpts((o) => ({ ...o, fields: { ...o.fields, [k]: v } }));

  const [showLinked, setShowLinked] = useState(false);
  const linkedIds = useMemo(() => new Set(linkedTrailers.map((t) => t.id)), [linkedTrailers]);
  const rows = kind === "vehicles" ? vehicles : showLinked ? [...trailers, ...linkedTrailers] : trailers;
  const groupsOf = (r: Unit) => r.groups?.length ? r.groups : [r.group ?? WHOLE_COMPANY];
  const allGroups = useMemo(() => [...new Set([...vehicles, ...trailers].flatMap(groupsOf))].sort(), [vehicles, trailers]);
  const groupOptions = [{ value: "", label: `All groups (${allGroups.length})` }, ...allGroups.map((g) => ({ value: g, label: g }))];
  const regionOptions = [{ value: "", label: "Don't set Region" }, ...allGroups.filter((g) => g !== WHOLE_COMPANY).map((g) => ({ value: g, label: g }))];
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (!grp || groupsOf(r).includes(grp)) && (!t || `${r.name} ${r.vin ?? ""} ${r.plate ?? ""}`.toLowerCase().includes(t)));
  }, [rows, q, grp]);
  const allChosen = rows.filter((r) => chosen.has(r.id) && !linkedIds.has(r.id)).map((r) => r.id);
  const eff: SyncOpts = { ...opts, fields: { ...opts.fields, region: !!opts.regionGroup } };

  const toggle = (id: string) => setChosen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const go = async () => {
    const ids = allChosen;
    for (let i = 0; i < ids.length; i += BATCH) {
      setProgress(`Working on ${Math.min(i + BATCH, ids.length)} of ${ids.length}…`);
      if (!(await add(kind, ids.slice(i, i + BATCH), eff))) { setProgress(null); return; }
    }
    setProgress(null);
    setChosen(new Set());
  };
  const doSync = async () => { setProgress("Updating linked trucks and trailers…"); await syncLinked(eff); setProgress(null); };

  const total = vehicles.length + trailers.length + linkedTrailers.length;
  if (!total && !linkedTrucks) return null;
  const fieldBox = (k: keyof SyncOpts["fields"], text: string) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14 }}>
      <input type="checkbox" checked={opts.fields[k]} onChange={(e) => setField(k, e.target.checked)} />{text}
    </label>
  );
  return (
    <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...link, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#fff" }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Bring in from Geotab · {vehicles.length.toLocaleString()} trucks · {trailers.length.toLocaleString()} trailers not added</span>
        <span style={{ color: muted }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {note && <div style={{ fontSize: 13, color: "#86efac", marginBottom: 8 }}>{note}</div>}

          <div style={lab}>Fields to bring over</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {fieldBox("vin", "VIN")}{fieldBox("plate", "Plate")}{fieldBox("vehicle", "Year · make · model (from VIN)")}
          </div>
          <div style={lab}>Region comes from this Geotab group</div>
          <CustomSelect value={opts.regionGroup} onChange={(v) => setOpts((o) => ({ ...o, regionGroup: v, regionName: o.regionName || v }))} options={regionOptions} />
          {opts.regionGroup && (
            <input style={{ ...input, marginTop: 6 }} placeholder="Region name to use" value={opts.regionName} onChange={(e) => setOpts((o) => ({ ...o, regionName: e.target.value }))} />
          )}
          <div style={lab}>Units you already have (same VIN or unit number)</div>
          <CustomSelect value={opts.existing} onChange={(v) => setOpts((o) => ({ ...o, existing: v as SyncOpts["existing"] }))} options={[
            { value: "skip", label: "Skip them" },
            { value: "fill", label: "Link them, fill in blank fields" },
            { value: "overwrite", label: "Link them, overwrite with Geotab's values" },
          ]} />
          {linkedTrucks > 0 && (
            <button type="button" style={{ ...btn, width: "100%", marginTop: 10, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", opacity: progress || opts.existing === "skip" ? 0.5 : 1 }}
              disabled={!!progress || opts.existing === "skip"} onClick={() => void doSync()}>
              Update the {linkedTrucks.toLocaleString()} linked truck{linkedTrucks === 1 ? "" : "s"} (and trailers) with these choices
            </button>
          )}

          <div style={{ ...lab, marginTop: 18 }}>Pick units</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {(["vehicles", "trailers"] as const).map((k) => (
              <button key={k} type="button" onClick={() => { setKind(k); setQ(""); setGrp(""); }}
                style={{ ...btn, flex: 1, background: kind === k ? "#fff" : "transparent", color: kind === k ? "#000" : "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
                {k === "vehicles" ? `Trucks (${vehicles.length.toLocaleString()})` : `Trailers (${trailers.length.toLocaleString()})`}
              </button>
            ))}
          </div>
          <input style={input} placeholder="Search unit number, VIN or plate" value={q} onChange={(e) => setQ(e.target.value)} />
          {kind === "trailers" && linkedTrailers.length > 0 && (
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginTop: 8, color: muted }}>
              <input type="checkbox" checked={showLinked} onChange={(e) => setShowLinked(e.target.checked)} />
              Also show the {linkedTrailers.length.toLocaleString()} already-linked trailers
            </label>
          )}
          {allGroups.length > 1 && <div style={{ marginTop: 8 }}><CustomSelect value={grp} onChange={setGrp} options={groupOptions} /></div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px", fontSize: 12, color: muted }}>
            <span>{matches.length.toLocaleString()} match{matches.length === 1 ? "" : "es"}{matches.length > SHOW ? ` · showing ${SHOW}` : ""}</span>
            <span style={{ display: "flex", gap: 12 }}>
              <button type="button" style={link} onClick={() => setChosen((p) => new Set([...p, ...matches.filter((m) => !linkedIds.has(m.id)).map((m) => m.id)]))}>Tick all {matches.length.toLocaleString()}</button>
              <button type="button" style={link} onClick={() => setChosen(new Set())}>Clear</button>
            </span>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {matches.slice(0, SHOW).map((x) => (
              <label key={x.id} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 14, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {linkedIds.has(x.id)
                  ? <span style={{ fontSize: 11, fontWeight: 800, color: "#86efac", minWidth: 16 }}>✓</span>
                  : <input type="checkbox" checked={chosen.has(x.id)} onChange={() => toggle(x.id)} />}
                <span style={{ fontWeight: 700 }}>{x.name}</span>
                {linkedIds.has(x.id) && <span style={{ fontSize: 11, color: "#86efac" }}>Linked{(x as any).linkedTo && (x as any).linkedTo !== x.name ? ` to ${(x as any).linkedTo}` : ""}</span>}
                <span style={{ color: muted, fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[x.group && x.group !== WHOLE_COMPANY ? x.group : null, x.vin, x.plate].filter(Boolean).join(" · ")}
                </span>
              </label>
            ))}
          </div>
          <button type="button" style={{ ...btn, width: "100%", marginTop: 10, opacity: allChosen.length && !progress ? 1 : 0.5 }} disabled={!allChosen.length || !!progress} onClick={() => void go()}>
            {progress ?? `Bring in ${allChosen.length.toLocaleString()} ${kind === "vehicles" ? "truck" : "trailer"}${allChosen.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
