"use client";
// app/planner/modals/solo/ImportUnitModal.tsx
//
// Import (admin): type a unit number, find it in the company's telematics (Geotab), see exactly which fields would be
// brought over (type first), and Import it, or Update it when ProTankr already has it. Done is white; Import/Update dark.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { supabase } from "@/lib/supabase/client";
import { DEFAULT_OPTS } from "@/lib/telematics/unitSync";
import type { FoundUnit } from "@/app/api/telematics/find-unit/route";

const muted = "rgba(255,255,255,0.5)";
const dark: React.CSSProperties = { display: "block", width: "100%", padding: "14px 18px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", marginTop: 10 };
const white: React.CSSProperties = { display: "block", width: "100%", padding: "14px 18px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer", marginTop: 10 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 };

async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token ?? ""; }

export function ImportUnitModal({ open, onClose, companyId, onImported }: { open: boolean; onClose: () => void; companyId: string; onImported: () => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const [units, setUnits] = useState<FoundUnit[] | null>(null);
  const [sel, setSel] = useState<FoundUnit | null>(null);
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => { if (!open) { setQ(""); setUnits(null); setSel(null); setRegion(""); setMsg(null); setConnected(true); } }, [open]);

  async function search() {
    if (q.trim().length < 2) return setMsg({ ok: false, text: "Type at least two characters of the unit number." });
    setBusy(true); setMsg(null); setSel(null);
    try {
      const r = await fetch(`/api/telematics/find-unit?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(q.trim())}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Couldn't search.");
      setConnected(j.connected !== false);
      const list = (j.units ?? []) as FoundUnit[];
      setUnits(list);
      if (list.length === 1) setSel(list[0]);
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? "Couldn't search." }); setUnits(null); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!sel) return;
    setBusy(true); setMsg(null);
    try {
      const opts = { ...DEFAULT_OPTS, existing: sel.existing ? "overwrite" : "skip", fields: { vin: true, plate: true, vehicle: true, region: !!region }, regionGroup: region, regionName: region };
      const body = { companyId, opts, ...(sel.kind === "truck" ? { importVehicles: [sel.providerId] } : { importTrailers: [sel.providerId] }) };
      const r = await fetch("/api/telematics/connect", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error ?? "Import failed.");
      setMsg({ ok: true, text: sel.existing ? `${sel.name} updated.` : `${sel.name} imported.` });
      await onImported();
      // The unit now exists in ProTankr: the button becomes Update.
      setSel({ ...sel, existing: sel.existing ?? { id: "", name: sel.name } });
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? "Import failed." }); }
    finally { setBusy(false); }
  }

  const row = (k: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 14 }}>
      <span style={{ color: muted }}>{k}</span><span style={{ fontWeight: 700, textAlign: "right", wordBreak: "break-all" }}>{v}</span>
    </div>
  );
  const none = <span style={{ color: muted, fontWeight: 500 }}>Not in Geotab</span>;

  return (
    <FullscreenModal open={open} onClose={onClose} title="Import from Geotab" footer={null}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} placeholder="Unit number" inputMode="text" autoCapitalize="characters" style={input} />
        <button type="button" onClick={() => void search()} disabled={busy} aria-busy={busy} style={{ ...dark, width: "auto", marginTop: 0, padding: "0 18px" }}>Find</button>
      </div>
      {!connected && <div style={{ fontSize: 14, color: "#fb923c", marginTop: 12 }}>No telematics is connected for this company. Connect it in Company Dashboard → Telematics.</div>}
      {units && units.length === 0 && connected && <div style={{ fontSize: 14, color: muted, marginTop: 12 }}>Nothing in Geotab matches "{q}".</div>}
      {units && units.length > 1 && !sel && (
        <div style={{ marginTop: 12 }}>
          {units.map((u) => (
            <button key={u.key} type="button" onClick={() => { setSel(u); setRegion(""); }}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "12px 14px", marginBottom: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", color: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 800, textAlign: "left" }}>
              <span>{u.name}</span><span style={{ fontSize: 12, color: muted, fontWeight: 600 }}>{u.kind === "truck" ? "Truck" : "Trailer"}{u.existing ? " · in ProTankr" : ""}</span>
            </button>
          ))}
        </div>
      )}
      {sel && (
        <div style={{ marginTop: 14, border: "1px solid rgba(255,255,255,0.14)", padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted }}>{sel.existing ? "Already in ProTankr · will update" : "Not in ProTankr yet · will import"}</div>
          <div style={{ marginTop: 6 }}>
            {row("Type", sel.kind === "truck" ? "Truck" : "Trailer")}
            {row("Unit #", sel.name)}
            {row("VIN", sel.vin ?? none)}
            {row("Plate", sel.plate ?? none)}
            {row("Year / make / model", [sel.year, sel.make, sel.model].filter(Boolean).join(" ") || <span style={{ color: muted, fontWeight: 500 }}>From the VIN (none found)</span>)}
            <div style={{ padding: "7px 0", fontSize: 14 }}>
              <div style={{ color: muted, marginBottom: 6 }}>Region (from the Geotab group)</div>
              <CustomSelect value={region} onChange={setRegion} options={[{ value: "", label: sel.groups.length ? "Don't set Region" : "No groups in Geotab" }, ...sel.groups.map((g) => ({ value: g, label: g }))]} disabled={!sel.groups.length} />
            </div>
          </div>
          {sel.existing && <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>Updating replaces the VIN, plate, year, make and model with Geotab's values.</div>}
        </div>
      )}
      {msg && <div style={{ fontSize: 14, marginTop: 12, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
      {sel && <button type="button" onClick={() => void run()} disabled={busy} aria-busy={busy} style={dark}>{sel.existing ? "Update" : "Import"}</button>}
      <button type="button" onClick={onClose} style={white}>Done</button>
    </FullscreenModal>
  );
}
