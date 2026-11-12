"use client";
// app/admin/EquipmentTable.tsx
//
// Every truck and trailer in the company in one table, all identity fields as columns. No region filter and no
// "search first" gate: everything is listed (inactive included, marked) so a unit can always be found. Tap a row
// to open the same editor the Trucks/Trailers tabs use. "Wrong type?" moves a unit to the other list (copies the
// identity fields to a new unit and retires the old one; compartments and permits are entered on the new unit).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Truck, Trailer } from "@/lib/ui/driver/EquipmentDetails";
import { DEFAULT_OPTS } from "@/lib/telematics/unitSync";

type Row = {
  kind: "Truck" | "Trailer"; id: string; name: string; active: boolean; make: string | null; model: string | null; year: number | null;
  vin: string | null; plate: string | null; region: string | null; area: string | null; status: string | null; location: string | null;
  inUse: string | null; geotab?: string; truck?: Truck; trailer?: Trailer;
};
type Col = { key: keyof Row; label: string; w: number };
const COLS: Col[] = [
  { key: "name", label: "Unit", w: 90 }, { key: "kind", label: "Type", w: 70 }, { key: "active", label: "Active", w: 64 },
  { key: "make", label: "Make", w: 100 }, { key: "model", label: "Model", w: 100 }, { key: "year", label: "Year", w: 56 },
  { key: "vin", label: "VIN", w: 170 }, { key: "plate", label: "Plate", w: 90 }, { key: "region", label: "Region", w: 110 },
  { key: "area", label: "Local area", w: 110 }, { key: "status", label: "Status", w: 90 }, { key: "location", label: "Location", w: 130 },
  { key: "inUse", label: "In use by", w: 130 },
  { key: "geotab", label: "Geotab", w: 110 },
];
type GUnit = { id: string; name: string; vin?: string | null; plate?: string | null; group?: string; groups?: string[] };
type GSummary = {
  connected: boolean; last_error?: string | null;
  matched?: { truckName: string }[];
  unmatchedVehicles?: GUnit[]; unmatchedTrailers?: GUnit[];
  linkedTrailers?: (GUnit & { linkedTo?: string | null })[];
  groups?: { path: string }[];
};
async function geo(method: "GET" | "POST", companyId: string, body?: unknown): Promise<{ ok: boolean; data: any }> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token ?? "";
  const r = await fetch(`/api/telematics/connect${method === "GET" ? `?companyId=${encodeURIComponent(companyId)}` : ""}`, {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    body: method === "GET" ? undefined : JSON.stringify({ companyId, ...(body as object) }),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}
const MUTED = "rgba(255,255,255,0.5)";
const cell: React.CSSProperties = { padding: "9px 10px", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const sel: React.CSSProperties = { padding: "7px 8px", fontSize: 12, color: "#fff", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2 };

export function EquipmentTable({ trucks, trailers, companyId, onOpenTruck, onOpenTrailer, onChanged, canDelete, onOpenTelematics }: {
  canDelete?: boolean; onOpenTelematics?: () => void;
  trucks: Truck[]; trailers: Trailer[]; companyId: string;
  onOpenTruck: (t: Truck) => void; onOpenTrailer: (t: Trailer) => void; onChanged: () => void;
}) {
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [act, setAct] = useState(""); const [region, setRegion] = useState("");
  const [sort, setSort] = useState<{ k: keyof Row; dir: 1 | -1 }>({ k: "name", dir: 1 });
  const [fixing, setFixing] = useState<Row | null>(null); const [deleting, setDeleting] = useState<Row | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [nu, setNu] = useState({ kind: "Truck", name: "", make: "", model: "", year: "", vin: "", plate: "", region: "", area: "" });
  const [g, setG] = useState<GSummary | null>(null); const [gOpen, setGOpen] = useState(false); const [gBusy, setGBusy] = useState(false);
  const [pickG, setPickG] = useState<Set<string>>(new Set());
  const [regionGroup, setRegionGroup] = useState("");
  // Everything Geotab has: VIN, plate, make/model/year decoded from the VIN, and the region from a chosen group.
  const syncOpts = () => ({ ...DEFAULT_OPTS, existing: "fill" as const, fields: { ...DEFAULT_OPTS.fields, region: !!regionGroup }, regionGroup, regionName: regionGroup.split("/").pop()?.trim() ?? "" });

  const loadGeo = useCallback(async () => {
    setGBusy(true);
    const r = await geo("GET", companyId);
    setGBusy(false);
    if (r.ok) setG(r.data as GSummary); else setMsg(r.data?.error ?? "Couldn't reach telematics.");
  }, [companyId]);
  useEffect(() => { void loadGeo(); }, [loadGeo]);

  const rows: Row[] = useMemo(() => [
    ...trucks.map((t): Row => ({ kind: "Truck", id: t.truck_id, name: t.truck_name, active: t.active, make: t.make, model: t.model, year: t.year, vin: t.vin_number, plate: t.plate_number, region: t.region, area: t.local_area, status: t.status_code, location: t.status_location, inUse: t.in_use_by_name ?? null, truck: t })),
    ...trailers.map((t): Row => ({ kind: "Trailer", id: t.trailer_id, name: t.trailer_name, active: t.active, make: t.make, model: t.model, year: t.year, vin: t.vin_number, plate: t.plate_number, region: t.region, area: t.local_area, status: t.status_code, location: t.status_location, inUse: t.in_use_by_name ?? null, trailer: t })),
  ], [trucks, trailers]);
  const linkedNames = useMemo(() => new Set([
    ...(g?.matched ?? []).map((m) => `Truck|${m.truckName}`),
    ...(g?.linkedTrailers ?? []).filter((t) => t.linkedTo).map((t) => `Trailer|${t.linkedTo}`),
  ]), [g]);
  const geoCell = (r: Row) => (!g?.connected ? "" : linkedNames.has(`${r.kind}|${r.name}`) ? "Linked" : "Not in Geotab");
  const regions = useMemo(() => [...new Set(rows.map((r) => r.region).filter(Boolean) as string[])].sort(), [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const out = rows.filter((r) => (!kind || r.kind === kind) && (!act || (act === "active") === r.active) && (!region || r.region === region)
      && (!s || [r.name, r.make, r.model, r.vin, r.plate, r.region, r.area, r.status, r.location, r.inUse, r.year != null ? String(r.year) : null].some((v) => v?.toLowerCase().includes(s))));
    const cmp = (a: Row, b: Row) => { const av = a[sort.k], bv = b[sort.k]; return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * sort.dir; };
    return out.sort(cmp);
  }, [rows, q, kind, act, region, sort]);

  const move = async (r: Row) => {
    setBusy(true); setMsg(null);
    const base = { vin_number: r.vin, plate_number: r.plate, make: r.make, model: r.model, year: r.year, region: r.region, local_area: r.area, active: true, company_id: companyId };
    const ins = r.kind === "Truck"
      ? await supabase.from("trailers").insert({ ...base, trailer_name: r.name, cg_max: 1.0 })
      : await supabase.from("trucks").insert({ ...base, truck_name: r.name });
    if (ins.error) { setBusy(false); setMsg(ins.error.message); return; }
    const old = r.kind === "Truck"
      ? await supabase.from("trucks").update({ active: false }).eq("truck_id", r.id)
      : await supabase.from("trailers").update({ active: false }).eq("trailer_id", r.id);
    setBusy(false); setFixing(null);
    if (old.error) { setMsg(`Created the ${r.kind === "Truck" ? "trailer" : "truck"}, but couldn't retire the old one: ${old.error.message}`); onChanged(); return; }
    setMsg(`${r.name} is now a ${r.kind === "Truck" ? "trailer" : "truck"}.${r.kind === "Truck" ? " Open it to add its compartments." : ""}`);
    onChanged();
  };

  const addRow = async () => {
    const name = nu.name.trim();
    if (!name) { setMsg("Enter a unit name."); return; }
    setBusy(true); setMsg(null);
    const base = { vin_number: nu.vin.trim() || null, plate_number: nu.plate.trim() || null, make: nu.make.trim() || null, model: nu.model.trim() || null, year: nu.year ? parseInt(nu.year) : null, region: nu.region.trim() || null, local_area: nu.area.trim() || null, active: true, company_id: companyId };
    const r = nu.kind === "Truck" ? await supabase.from("trucks").insert({ ...base, truck_name: name }) : await supabase.from("trailers").insert({ ...base, trailer_name: name, cg_max: 1.0 });
    setBusy(false);
    if (r.error) { setMsg(r.error.message); return; }
    setMsg(`${nu.kind} ${name} added.${nu.kind === "Trailer" ? " Open it to add its compartments." : ""}`);
    setNu({ ...nu, name: "", make: "", model: "", year: "", vin: "", plate: "" });
    onChanged(); void loadGeo();
  };
  const importPicked = async () => {
    const veh = (g?.unmatchedVehicles ?? []).filter((u) => pickG.has(`v:${u.id}`)).map((u) => u.id);
    const trl = (g?.unmatchedTrailers ?? []).filter((u) => pickG.has(`t:${u.id}`)).map((u) => u.id);
    const opts = syncOpts();
    setGBusy(true); setMsg(null);
    for (const [key, ids] of [["importVehicles", veh], ["importTrailers", trl]] as const) {
      if (!ids.length) continue;
      const r = await geo("POST", companyId, { [key]: ids, opts });
      if (!r.ok) { setGBusy(false); setMsg(r.data?.error ?? "Import failed."); return; }
    }
    setPickG(new Set()); setGBusy(false);
    setMsg(`Added ${veh.length + trl.length} from Geotab.${trl.length ? " Open the new trailers to add compartments." : ""}`);
    onChanged(); await loadGeo();
  };
  const fillFromGeo = async () => {
    setGBusy(true); setMsg(null);
    const r = await geo("POST", companyId, { syncLinked: true, opts: syncOpts() });
    setGBusy(false);
    if (!r.ok) { setMsg(r.data?.error ?? "Update failed."); return; }
    const x = r.data?.result as { updated?: number } | undefined;
    setMsg(`Filled blanks (VIN, plate, make, model, year, region) on ${x?.updated ?? 0} linked unit${x?.updated === 1 ? "" : "s"}.`);
    onChanged(); await loadGeo();
  };

  const remove = async (r: Row) => {
    setBusy(true); setMsg(null);
    const { error } = r.kind === "Truck"
      ? await supabase.rpc("delete_truck", { p_truck_id: r.id, p_company_id: companyId })
      : await supabase.rpc("delete_trailer", { p_trailer_id: r.id, p_company_id: companyId });
    setBusy(false); setDeleting(null);
    if (error) { setMsg(`Couldn't delete ${r.name}: ${error.message}`); return; }
    setMsg(`${r.kind} ${r.name} deleted.`);
    onChanged();
  };

  const th = (c: Col) => (
    <th key={c.key} onClick={() => setSort((s) => ({ k: c.key, dir: s.k === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
      style={{ ...cell, width: c.w, minWidth: c.w, textAlign: "left", cursor: "pointer", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, position: "sticky", top: 0, background: "#161616", zIndex: c.key === "name" ? 3 : 2, ...(c.key === "name" ? { left: 0 } : {}) }}>
      {c.label}{sort.k === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any field…" style={{ ...sel, flex: 1, minWidth: 160, fontSize: 14 }} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={sel}><option value="">Trucks + trailers</option><option value="Truck">Trucks</option><option value="Trailer">Trailers</option></select>
        <select value={act} onChange={(e) => setAct(e.target.value)} style={sel}><option value="">Active + inactive</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} style={sel}><option value="">All regions</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setAdding((a) => !a)} style={{ ...sel, fontWeight: 800, cursor: "pointer" }}>{adding ? "Close add row" : "+ Add unit"}</button>
        <button type="button" onClick={() => { setGOpen((o) => !o); if (!gOpen) void loadGeo(); }} style={{ ...sel, fontWeight: 800, cursor: "pointer" }}>
          Check Geotab{g?.connected ? ` (${(g.unmatchedVehicles?.length ?? 0) + (g.unmatchedTrailers?.length ?? 0)} not in your list)` : ""}
        </button>
      </div>
      {adding && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, padding: 10, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2 }}>
          <select value={nu.kind} onChange={(e) => setNu({ ...nu, kind: e.target.value })} style={sel}><option>Truck</option><option>Trailer</option></select>
          {([["name", "Unit", 90], ["make", "Make", 90], ["model", "Model", 90], ["year", "Year", 60], ["vin", "VIN", 160], ["plate", "Plate", 80], ["region", "Region", 100], ["area", "Local area", 100]] as const).map(([k, ph, w]) => (
            <input key={k} value={(nu as Record<string, string>)[k]} onChange={(e) => setNu({ ...nu, [k]: e.target.value })} placeholder={ph} style={{ ...sel, width: w, fontSize: 14 }} autoCapitalize={k === "vin" || k === "plate" ? "characters" : "words"} />
          ))}
          <button type="button" disabled={busy} onClick={() => void addRow()} style={{ padding: "8px 14px", fontSize: 13, fontWeight: 800, background: "#fff", color: "#000", border: "none", borderRadius: 2, cursor: "pointer" }}>{busy ? "Adding…" : "Add"}</button>
        </div>
      )}
      {gOpen && (
        <div style={{ marginBottom: 12, padding: 12, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2 }}>
          {gBusy && !g ? <div style={{ color: MUTED, fontSize: 13 }}>Checking Geotab…</div> : !g?.connected ? (
            <div style={{ fontSize: 14 }}>
              Geotab isn't connected for this company. <button type="button" onClick={onOpenTelematics} style={{ background: "none", border: "none", color: "#93c5fd", fontWeight: 700, cursor: "pointer", padding: 0, fontSize: 14 }}>Connect Geotab</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
                {g.matched?.length ?? 0} trucks and {(g.linkedTrailers ?? []).filter((t) => t.linkedTo).length} trailers are linked. Units in Geotab that aren't in your list are below; tick the ones to add. The Geotab column in the table shows which of yours are linked.
                {g.last_error ? ` Last problem: ${g.last_error}` : ""}
              </div>
              {[...(g.unmatchedVehicles ?? []).map((u) => ({ k: `v:${u.id}`, type: "Truck", u })), ...(g.unmatchedTrailers ?? []).map((u) => ({ k: `t:${u.id}`, type: "Trailer", u }))].slice(0, 200).map(({ k, type, u }) => (
                <label key={k} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={pickG.has(k)} onChange={() => setPickG((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; })} />
                  <span style={{ width: 56, color: MUTED }}>{type}</span><b style={{ width: 90 }}>{u.name}</b>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: MUTED }}>{[u.vin, u.plate, u.group].filter(Boolean).join(" · ")}</span>
                </label>
              ))}
              {(g.unmatchedVehicles?.length ?? 0) + (g.unmatchedTrailers?.length ?? 0) === 0 && <div style={{ fontSize: 13 }}>Everything in Geotab is already in your list.</div>}
              {(g.unmatchedVehicles?.length ?? 0) + (g.unmatchedTrailers?.length ?? 0) > 0 && (
                <button type="button" onClick={() => setPickG(pickG.size ? new Set() : new Set([...(g.unmatchedVehicles ?? []).map((u) => `v:${u.id}`), ...(g.unmatchedTrailers ?? []).map((u) => `t:${u.id}`)]))} style={{ background: "none", border: "none", color: "#93c5fd", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "8px 0 0" }}>{pickG.size ? "Clear selection" : "Select all"}</button>
              )}
              <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>Brings over: unit name, VIN, plate, and make, model and year decoded from the VIN. Only blank fields on units you already have are filled.</div>
              {(g.groups?.length ?? 0) > 1 && (
                <select value={regionGroup} onChange={(e) => setRegionGroup(e.target.value)} style={{ ...sel, marginTop: 8, maxWidth: "100%" }}>
                  <option value="">Don't set Region from Geotab groups</option>
                  {g.groups!.map((x) => <option key={x.path} value={x.path}>Region from group: {x.path}</option>)}
                </select>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" disabled={gBusy || pickG.size === 0} onClick={() => void importPicked()} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 800, background: "#fff", color: "#000", border: "none", borderRadius: 2, cursor: "pointer", opacity: pickG.size ? 1 : 0.4 }}>{gBusy ? "Working…" : `Add ${pickG.size} selected`}</button>
                <button type="button" disabled={gBusy} onClick={() => void fillFromGeo()} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 2, cursor: "pointer" }}>Fill blanks on linked units</button>
                <button type="button" onClick={onOpenTelematics} style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer" }}>Geotab settings</button>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{shown.length} of {rows.length} units. Tap a unit to edit; change its Type to move it. Scroll sideways for every field.</div>
      {msg && <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 8 }}>{msg}</div>}
      <div style={{ overflow: "auto", maxHeight: "60vh", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: COLS.reduce((a, c) => a + c.w, 0) + 90 }}>
          <thead><tr>{COLS.map(th)}<th style={{ ...cell, width: 90, position: "sticky", top: 0, background: "#161616", zIndex: 2 }} /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.kind}${r.id}`} style={{ opacity: r.active ? 1 : 0.5, cursor: "pointer" }}
                onClick={() => (r.kind === "Truck" ? onOpenTruck(r.truck!) : onOpenTrailer(r.trailer!))}>
                {COLS.map((c) => (
                  <td key={c.key} style={{ ...cell, ...(c.key === "name" ? { position: "sticky", left: 0, background: "#111", fontWeight: 800, zIndex: 1 } : {}) }}
                    onClick={c.key === "kind" ? (e) => e.stopPropagation() : undefined}>
                    {c.key === "kind" ? (
                      <select value={r.kind} onChange={(e) => { if (e.target.value !== r.kind) { setFixing(r); setDeleting(null); } }} style={{ ...sel, padding: "4px 4px", fontSize: 12, width: "100%" }}>
                        <option value="Truck">Truck</option><option value="Trailer">Trailer</option>
                      </select>
                    ) : c.key === "geotab" ? (geoCell(r) || <span style={{ color: "rgba(255,255,255,0.25)" }}>-</span>) : c.key === "active" ? (r.active ? "Yes" : "No") : r[c.key] == null || r[c.key] === "" ? <span style={{ color: "rgba(255,255,255,0.25)" }}>-</span> : String(r[c.key])}
                  </td>
                ))}
                <td style={cell} onClick={(e) => e.stopPropagation()}>
                  {canDelete && <button type="button" onClick={() => { setDeleting(r); setFixing(null); }} style={{ background: "none", border: "none", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "0 0 0 10px" }}>Delete</button>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={COLS.length + 1} style={{ ...cell, color: MUTED }}>Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
      {deleting && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(248,113,113,0.5)", background: "rgba(248,113,113,0.08)", borderRadius: 2, fontSize: 14 }}>
          Permanently delete {deleting.kind.toLowerCase()} <b>{deleting.name}</b>? This cannot be undone. If it is the wrong-type copy, make sure the right one exists first.
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => void remove(deleting)} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 800, background: "#ef4444", color: "#fff", border: "none", borderRadius: 2, cursor: "pointer" }}>{busy ? "Deleting…" : "Delete it"}</button>
            <button type="button" disabled={busy} onClick={() => setDeleting(null)} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 2, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
      {fixing && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.08)", borderRadius: 2, fontSize: 14 }}>
          Move <b>{fixing.name}</b> from {fixing.kind === "Truck" ? "trucks to trailers" : "trailers to trucks"}? Its identity fields are copied to a new {fixing.kind === "Truck" ? "trailer" : "truck"} and the old {fixing.kind.toLowerCase()} is set inactive (not deleted).
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => void move(fixing)} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 800, background: "#fff", color: "#000", border: "none", borderRadius: 2, cursor: "pointer" }}>{busy ? "Moving…" : "Move it"}</button>
            <button type="button" disabled={busy} onClick={() => setFixing(null)} style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 2, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
