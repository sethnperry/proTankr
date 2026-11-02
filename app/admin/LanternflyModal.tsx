"use client";
// app/admin/LanternflyModal.tsx
//
// Company Dashboard → Spotted Lanternfly. Zone: the counties the company treats as quarantine (add one, paste a
// list, remove). Compliance: every in-zone county a recent trip entered, attested or missing. Admin only.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { stopsFor } from "@/lib/slf/loadStops";
import { complianceColumns, complianceFilters, complianceRows, complianceSummary, normState, parseCounties, zoneKeys, type ComplianceRow, type SlfAttestationRow, type Zone } from "@/lib/slf/slf";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", fontSize: 15, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "11px 16px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" };

export default function LanternflyModal({ open, onClose, companyId, userId }: { open: boolean; onClose: () => void; companyId: string; userId: string | null }) {
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameOf = useCallback((id: string) => members.find((m) => m.user_id === id)?.display_name ?? "Driver", [members]);
  const [tab, setTab] = useState<"zone" | "compliance">("zone");
  const [zone, setZone] = useState<Zone[]>([]);
  const [state, setState] = useState("PA");
  const [one, setOne] = useState("");
  const [bulk, setBulk] = useState("");
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadZone = useCallback(async () => {
    const { data, error: e } = await supabase.from("slf_zone_counties").select("state, county").eq("company_id", companyId).order("state").order("county");
    if (e) setError(e.message);
    setZone((data ?? []) as Zone[]);
  }, [companyId]);
  useEffect(() => { if (open) void loadZone(); }, [open, loadZone]);

  const add = async (names: string[]) => {
    const st = normState(state);
    if (!st || st.length !== 2) { setError("Enter the two-letter state."); return; }
    if (names.length === 0) return;
    setBusy(true); setError(null);
    const { error: e } = await supabase.from("slf_zone_counties").upsert(names.map((county) => ({ company_id: companyId, state: st, county })), { onConflict: "company_id,state,county", ignoreDuplicates: true });
    if (e) setError(e.message); else { setOne(""); setBulk(""); await loadZone(); }
    setBusy(false);
  };
  const remove = async (z: Zone) => {
    setBusy(true); setError(null);
    const { error: e } = await supabase.from("slf_zone_counties").delete().eq("company_id", companyId).eq("state", z.state).eq("county", z.county);
    if (e) setError(e.message); else await loadZone();
    setBusy(false);
  };

  const loadCompliance = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data: trips, error: te } = await supabase.from("trips").select("trip_id, driver_id, started_at").eq("company_id", companyId).gte("started_at", since).order("started_at", { ascending: false }).limit(500);
      if (te) throw te;
      const ids = ((trips ?? []) as any[]).map((t) => t.trip_id as string);
      const pickups: any[] = [], deliveries: any[] = [], atts: SlfAttestationRow[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100);
        const [p, d, a] = await Promise.all([
          supabase.from("trip_pickups").select("*").in("trip_id", part),
          supabase.from("trip_deliveries").select("*").in("trip_id", part),
          supabase.from("slf_attestations").select("*").in("trip_id", part),
        ]);
        const err = [p, d, a].find((r) => r.error)?.error;
        if (err) throw err;
        pickups.push(...(p.data ?? [])); deliveries.push(...(d.data ?? [])); atts.push(...((a.data ?? []) as SlfAttestationRow[]));
      }
      const stops = await stopsFor(pickups, deliveries);
      setRows(complianceRows((trips ?? []) as any[], stops, zoneKeys(zone), atts));
    } catch (e: any) { setError(e?.message ?? "Couldn't load."); }
    setBusy(false);
  }, [companyId, zone]);
  useEffect(() => { if (open && tab === "compliance") void loadCompliance(); }, [open, tab, loadCompliance]);

  const columns = useMemo(() => complianceColumns(nameOf), [nameOf]);
  const filters = useMemo(() => complianceFilters(nameOf), [nameOf]);
  void userId;

  return (
    <>
      <FullscreenModal open={open && tab === "zone"} title="Spotted Lanternfly" onClose={onClose} footer={null}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button type="button" style={{ ...btn, flex: 1 }} disabled>Zone</button>
          <button type="button" style={{ ...btn, flex: 1, background: "transparent", color: "#fff", border: `1px solid ${HAIR}` }} onClick={() => setTab("compliance")}>Compliance</button>
        </div>
        <div style={{ color: MUTE, fontSize: 13, marginBottom: 12 }}>Counties your company treats as quarantine. A driver is asked to inspect when a trip arrives at a stop in one. Copy the current list from your state's agriculture department.</div>
        {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8, marginBottom: 8 }}>
          <input style={inp} value={state} maxLength={2} onChange={(e) => setState(e.target.value.toUpperCase())} aria-label="State" />
          <input style={inp} value={one} placeholder="County" onChange={(e) => setOne(e.target.value)} />
        </div>
        <button type="button" style={{ ...btn, width: "100%", marginBottom: 14 }} disabled={busy || !one.trim()} onClick={() => void add(parseCounties(one))}>Add county</button>
        <textarea style={{ ...inp, minHeight: 84, marginBottom: 8 }} value={bulk} placeholder="Or paste a list: Berks, Lehigh, Northampton…" onChange={(e) => setBulk(e.target.value)} />
        <button type="button" style={{ ...btn, width: "100%", marginBottom: 18 }} disabled={busy || !bulk.trim()} onClick={() => void add(parseCounties(bulk))}>Add pasted list to {normState(state) || "state"}</button>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>In the zone ({zone.length})</div>
        {zone.length === 0 && <div style={{ color: MUTE, fontSize: 14 }}>No counties yet. Nothing will be asked of drivers.</div>}
        {zone.map((z) => (
          <div key={`${z.state}${z.county}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: `1px solid ${HAIR}`, fontSize: 15 }}>
            <span>{z.county}, {z.state}</span>
            <button type="button" disabled={busy} onClick={() => void remove(z)} style={{ background: "none", border: "none", color: "#f87171", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Remove</button>
          </div>
        ))}
      </FullscreenModal>

      <ReportShell open={open && tab === "compliance"} title="Lanternfly compliance · 90 days" onClose={() => setTab("zone")} rows={rows} columns={columns} filters={filters} getKey={(r) => r.key}
        fileName="lanternfly_compliance" summary={complianceSummary} empty={busy ? "Loading…" : zone.length === 0 ? "Set the zone counties first." : "No trips entered a zone county."} />
    </>
  );
}
