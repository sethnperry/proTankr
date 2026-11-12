"use client";
// app/admin/EquipmentTable.tsx
//
// Every truck and trailer in the company in one table, all identity fields as columns. No region filter and no
// "search first" gate: everything is listed (inactive included, marked) so a unit can always be found. Tap a row
// to open the same editor the Trucks/Trailers tabs use. "Wrong type?" moves a unit to the other list (copies the
// identity fields to a new unit and retires the old one; compartments and permits are entered on the new unit).

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Truck, Trailer } from "@/lib/ui/driver/EquipmentDetails";

type Row = {
  kind: "Truck" | "Trailer"; id: string; name: string; active: boolean; make: string | null; model: string | null; year: number | null;
  vin: string | null; plate: string | null; region: string | null; area: string | null; status: string | null; location: string | null;
  inUse: string | null; truck?: Truck; trailer?: Trailer;
};
type Col = { key: keyof Row; label: string; w: number };
const COLS: Col[] = [
  { key: "name", label: "Unit", w: 90 }, { key: "kind", label: "Type", w: 70 }, { key: "active", label: "Active", w: 64 },
  { key: "make", label: "Make", w: 100 }, { key: "model", label: "Model", w: 100 }, { key: "year", label: "Year", w: 56 },
  { key: "vin", label: "VIN", w: 170 }, { key: "plate", label: "Plate", w: 90 }, { key: "region", label: "Region", w: 110 },
  { key: "area", label: "Local area", w: 110 }, { key: "status", label: "Status", w: 90 }, { key: "location", label: "Location", w: 130 },
  { key: "inUse", label: "In use by", w: 130 },
];
const MUTED = "rgba(255,255,255,0.5)";
const cell: React.CSSProperties = { padding: "9px 10px", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const sel: React.CSSProperties = { padding: "7px 8px", fontSize: 12, color: "#fff", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2 };

export function EquipmentTable({ trucks, trailers, companyId, onOpenTruck, onOpenTrailer, onChanged, canDelete }: {
  canDelete?: boolean;
  trucks: Truck[]; trailers: Trailer[]; companyId: string;
  onOpenTruck: (t: Truck) => void; onOpenTrailer: (t: Trailer) => void; onChanged: () => void;
}) {
  const [q, setQ] = useState(""); const [kind, setKind] = useState(""); const [act, setAct] = useState(""); const [region, setRegion] = useState("");
  const [sort, setSort] = useState<{ k: keyof Row; dir: 1 | -1 }>({ k: "name", dir: 1 });
  const [fixing, setFixing] = useState<Row | null>(null); const [deleting, setDeleting] = useState<Row | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => [
    ...trucks.map((t): Row => ({ kind: "Truck", id: t.truck_id, name: t.truck_name, active: t.active, make: t.make, model: t.model, year: t.year, vin: t.vin_number, plate: t.plate_number, region: t.region, area: t.local_area, status: t.status_code, location: t.status_location, inUse: t.in_use_by_name ?? null, truck: t })),
    ...trailers.map((t): Row => ({ kind: "Trailer", id: t.trailer_id, name: t.trailer_name, active: t.active, make: t.make, model: t.model, year: t.year, vin: t.vin_number, plate: t.plate_number, region: t.region, area: t.local_area, status: t.status_code, location: t.status_location, inUse: t.in_use_by_name ?? null, trailer: t })),
  ], [trucks, trailers]);
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
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{shown.length} of {rows.length} units. Tap a unit to edit. Scroll sideways for every field.</div>
      {msg && <div style={{ fontSize: 13, color: "#fbbf24", marginBottom: 8 }}>{msg}</div>}
      <div style={{ overflow: "auto", maxHeight: "60vh", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: COLS.reduce((a, c) => a + c.w, 0) + 170 }}>
          <thead><tr>{COLS.map(th)}<th style={{ ...cell, width: 170, position: "sticky", top: 0, background: "#161616", zIndex: 2 }} /></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.kind}${r.id}`} style={{ opacity: r.active ? 1 : 0.5, cursor: "pointer" }}
                onClick={() => (r.kind === "Truck" ? onOpenTruck(r.truck!) : onOpenTrailer(r.trailer!))}>
                {COLS.map((c) => (
                  <td key={c.key} style={{ ...cell, ...(c.key === "name" ? { position: "sticky", left: 0, background: "#111", fontWeight: 800, zIndex: 1 } : {}) }}>
                    {c.key === "active" ? (r.active ? "Yes" : "No") : r[c.key] == null || r[c.key] === "" ? <span style={{ color: "rgba(255,255,255,0.25)" }}>-</span> : String(r[c.key])}
                  </td>
                ))}
                <td style={cell} onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => { setFixing(r); setDeleting(null); }} style={{ background: "none", border: "none", color: "#93c5fd", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>Wrong type?</button>
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
