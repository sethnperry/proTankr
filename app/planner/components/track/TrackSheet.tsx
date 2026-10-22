"use client";
// app/planner/components/track/TrackSheet.tsx
//
// Track: look up a piece of equipment or a driver. The list is laid out like the equipment
// picker: pairings first (truck and trailer on one row, numerically by truck so the connector
// runs straight across), then loose trucks, then loose trailers, with the same Region / Local
// Area / Away filter. Each card shows the unit's last known status. Typing also searches the
// telematics provider's drivers (members or not) and finds the truck they're in. Picking
// anything opens the Track detail.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import RegionLocalAreaFilterModal, { type EquipmentFilter } from "../../modals/RegionLocalAreaFilterModal";
import { fleetStatusColor, fleetStatusLabel } from "../../modals/EquipmentStatusModal";
import { buildTrackRows, type TrackCombo, type TrackUnit } from "@/lib/equipment/trackList";
import { ageText, mapsUrl } from "@/lib/equipment/trackFormat";
import { fieldInput, muted } from "../trip/tripUi";
import { hosText } from "@/lib/telematics/progress";
import { TrackDetail } from "./TrackDetail";

type DriverPlace = { vehicleId: string; truckId: string | null; vehicleName: string; lat: number | null; lon: number | null; at: string | null };
type VehicleHit = { vehicleId: string; name: string; truckId: string | null; lat: number | null; lon: number | null; at: string | null; speedMph: number | null; driverName: string | null; signedIn: boolean };
type DriverHit = {
  providerId: string; name: string; employeeNo: string | null; memberName: string | null;
  now: DriverPlace | null; last: DriverPlace | null;
  diag?: string;
  debug?: string[];
  hos?: { driveLeftMin: number | null; dutyLeftMin: number | null; status: string | null; statusSince?: string | null; offSince?: string | null; at: string } | null;
};

const COLS = "id, name, active, region, local_area, current_region, current_local_area, status_code, status_notes, sub_status, status_location, status_updated_at";
const toUnit = (r: any, kind: "truck" | "trailer"): TrackUnit => ({
  id: r[`${kind}_id`], name: r[`${kind}_name`] ?? "—", kind,
  region: r.region ?? null, localArea: r.local_area ?? null, currentRegion: r.current_region ?? null, currentLocalArea: r.current_local_area ?? null,
  statusCode: r.status_code ?? null, statusNotes: r.status_notes ?? null, subStatus: r.sub_status ?? null,
  statusLocation: r.status_location ?? null, statusUpdatedAt: r.status_updated_at ?? null,
});

function UnitCard({ u, onClick, mine }: { u: TrackUnit; onClick: () => void; mine?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: "block", width: "100%", minWidth: 0, textAlign: "left", cursor: "pointer", color: "#fff", padding: "10px 12px", boxSizing: "border-box",
        border: `1px solid ${mine ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.14)"}`, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
      {u.statusCode ? (
        <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: fleetStatusColor(u.statusCode), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          ● {fleetStatusLabel(u.statusCode) || u.statusCode}{u.subStatus ? ` · ${u.subStatus}` : ""}
        </div>
      ) : <div style={{ fontSize: 12, marginTop: 3, color: "rgba(255,255,255,0.3)" }}>No status</div>}
      {u.statusLocation && <div style={{ fontSize: 11, marginTop: 2, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.statusLocation}</div>}
    </button>
  );
}

export function TrackSheet({ open, onClose, companyId, role, myTruckId, myTrailerId }: {
  open: boolean; onClose: () => void; companyId: string | null; role: string | null;
  myTruckId: string | null; myTrailerId: string | null;
}) {
  const [trucks, setTrucks] = useState<TrackUnit[]>([]);
  const [trailers, setTrailers] = useState<TrackUnit[]>([]);
  const [combos, setCombos] = useState<TrackCombo[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<EquipmentFilter>({ region: null, localArea: null, awayOnly: false });
  const [filterOpen, setFilterOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverHit[]>([]);
  const [vehicles, setVehicles] = useState<VehicleHit[]>([]);
  const [driversBusy, setDriversBusy] = useState(false);
  const [driverNote, setDriverNote] = useState<string | null>(null);
  const [openDriver, setOpenDriver] = useState<string | null>(null);
  const [debugLines, setDebugLines] = useState<Record<string, string[] | "loading">>({});
  const loadDebug = async (driverId: string) => {
    if (!companyId || debugLines[driverId]) return;
    setDebugLines((m) => ({ ...m, [driverId]: "loading" }));
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const r = await fetch(`/api/telematics/drivers?companyId=${encodeURIComponent(companyId)}&debug=${encodeURIComponent(driverId)}`, { headers: { Authorization: `Bearer ${token ?? ""}` }, cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      setDebugLines((m) => ({ ...m, [driverId]: j?.lines ?? ["Geotab didn't answer. Close and open this again in a minute."] }));
    } catch { setDebugLines((m) => ({ ...m, [driverId]: ["Couldn't reach the server."] })); }
  };
  const [pick, setPick] = useState<{ truckId: string | null; trailerId: string | null; vehicle?: { id: string; name: string } | null } | null>(null);

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const sel = (kind: "truck" | "trailer") => COLS.replace("id,", `${kind}_id,`).replace("name,", `${kind}_name,`);
    const [t, r, c] = await Promise.all([
      supabase.from("trucks").select(sel("truck")).eq("company_id", companyId),
      supabase.from("trailers").select(sel("trailer")).eq("company_id", companyId),
      supabase.from("equipment_combos").select("combo_id, truck_id, trailer_id").eq("company_id", companyId).eq("active", true),
    ]);
    setTrucks(((t.data ?? []) as any[]).filter((x) => x.active !== false).map((x) => toUnit(x, "truck")));
    setTrailers(((r.data ?? []) as any[]).filter((x) => x.active !== false).map((x) => toUnit(x, "trailer")));
    setCombos(((c.data ?? []) as any[]).filter((x) => x.truck_id && x.trailer_id).map((x) => ({ comboId: x.combo_id, truckId: x.truck_id, trailerId: x.trailer_id })));
    setLoading(false);
  }, [companyId]);

  const [submitted, setSubmitted] = useState("");
  useEffect(() => { if (open) { setQ(""); setSubmitted(""); setDrivers([]); setVehicles([]); setDriverNote(null); void reload(); } }, [open, reload]);

  // Driver and Geotab-vehicle search against the telematics provider. Geotab limits how many calls it
  // answers per minute, so this only runs when you press Search (or Enter), never while you type.
  useEffect(() => {
    const term = submitted.trim();
    if (!open || !companyId || term.length < 2) { setDrivers([]); setVehicles([]); setDriverNote(null); return; }
    let off = false;
    const timer = window.setTimeout(async () => {
      setDriversBusy(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch(`/api/telematics/drivers?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(term)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        if (off) return;
        setDrivers(j?.connected ? (j.drivers as DriverHit[]) : []);
        setVehicles(j?.connected ? ((j.vehicles ?? []) as VehicleHit[]) : []);
        setDriverNote(j && !j.connected ? "Driver search needs the company's Geotab connection." : j?.error ?? null);
      } catch { if (!off) { setDrivers([]); setVehicles([]); } }
      finally { if (!off) setDriversBusy(false); }
    }, 0);
    return () => { off = true; window.clearTimeout(timer); };
  }, [submitted, open, companyId]);

  const rows = useMemo(() => buildTrackRows(trucks, trailers, combos, { region: filter.region, localArea: filter.localArea, awayOnly: filter.awayOnly }, q), [trucks, trailers, combos, filter, q]);
  const truckById = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);
  const trailerById = useMemo(() => new Map(trailers.map((t) => [t.id, t])), [trailers]);
  // Geotab vehicles not already listed below as one of our own units.
  const geoVehicles = useMemo(() => vehicles.filter((v) => !v.truckId || !rows.trucks.some((t) => t.id === v.truckId) && !rows.combos.some((c) => c.truck.id === v.truckId)), [vehicles, rows]);
  const filtered = !!(filter.region || filter.localArea || filter.awayOnly);

  const openTruck = (truckId: string) => {
    const combo = combos.find((c) => c.truckId === truckId);
    setPick({ truckId, trailerId: combo?.trailerId ?? null });
  };
  const canManage = role === "admin" || role === "dispatch" || role === "lead";
  const detailTruck = pick?.truckId ? truckById.get(pick.truckId) ?? null : null;
  const detailTrailer = pick?.trailerId ? trailerById.get(pick.trailerId) ?? null : null;

  const myCombo = myTruckId ? combos.find((c) => c.truckId === myTruckId) : null;
  const mine = (truckId: string | null, trailerId: string | null) => (!!myTruckId && truckId === myTruckId) || (!!myTrailerId && trailerId === myTrailerId);

  const driverLine = (d: DriverHit) => {
    const p = d.now ?? d.last;
    if (!p) return <span style={{ color: muted }}>Not signed in to a truck in the last 30 days.</span>;
    return (
      <>
        {d.now ? <>In <b>{p.vehicleName}</b></> : <>Last in <b>{p.vehicleName}</b> <span style={{ color: muted }}>(not signed in now)</span></>}
        <span style={{ color: muted }}> · {ageText(p.at)}</span>
      </>
    );
  };

  return (
    <FullscreenModal open={open} onClose={onClose} title="Track" footer={null}
      headerRight={
        <button type="button" onClick={() => setFilterOpen(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: filtered ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
          Filter{filtered ? " •" : ""}
        </button>
      }>
      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit number or driver name" enterKeyHint="search" style={{ ...fieldInput, flex: 1, minWidth: 0 }} />
        <button type="submit" disabled={q.trim().length < 2 || driversBusy} aria-busy={driversBusy}
          style={{ padding: "0 16px", border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", opacity: q.trim().length < 2 ? 0.5 : 1 }}>
          {driversBusy ? "…" : "Search"}
        </button>
      </form>
      {q.trim().length >= 2 && q.trim() !== submitted && (
        <div style={{ fontSize: 12, color: muted, margin: "-6px 0 10px" }}>Press Search to look up drivers and Geotab vehicles. The lists below filter as you type.</div>
      )}

      {myCombo && !q && (
        <button type="button" onClick={() => openTruck(myCombo.truckId)}
          style={{ width: "100%", padding: "11px 12px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
          My equipment · {truckById.get(myCombo.truckId)?.name} / {trailerById.get(myCombo.trailerId)?.name} ›
        </button>
      )}

      {submitted.length >= 2 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>
            Drivers{driversBusy ? " · searching…" : ""}
          </div>
          {driverNote && <div style={{ fontSize: 13, color: "#fb923c" }}>{driverNote}</div>}
          {!driversBusy && !driverNote && drivers.length === 0 && <div style={{ fontSize: 13, color: muted }}>No driver found in Geotab.</div>}
          {drivers.map((d) => {
            const p = d.now ?? d.last;
            const tappable = true;
            const hosT = d.hos ? hosText(d.hos) : null;
            return (
              <div key={d.providerId} style={{ border: "1px solid rgba(255,255,255,0.14)", marginBottom: 8 }}>
                <button type="button" disabled={!tappable} onClick={() => { if (!p) { setOpenDriver((cur) => (cur === d.providerId ? null : d.providerId)); void loadDebug(d.providerId); return; } if (p.truckId) openTruck(p.truckId); else setPick({ truckId: null, trailerId: null, vehicle: { id: p.vehicleId, name: p.vehicleName } }); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", background: "transparent", border: "none", color: "#fff", cursor: tappable ? "pointer" : "default" }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    {d.name}
                    {d.memberName ? null : <span style={{ fontSize: 11, fontWeight: 700, color: muted, marginLeft: 8 }}>not a ProTankr member</span>}
                    {d.employeeNo && <span style={{ fontSize: 12, fontWeight: 600, color: muted, marginLeft: 8 }}>#{d.employeeNo}</span>}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 3 }}>{driverLine(d)}</div>
                  {!p && d.diag && <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>{d.diag}</div>}
                  {!p && <div style={{ fontSize: 11, color: "#93c5fd", marginTop: 3 }}>{openDriver === d.providerId ? "Hide details ▲" : "Tap for details ▼"}</div>}
                  {!p && openDriver === d.providerId && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                      <div>Geotab doesn't say which vehicle this driver is in. What it returned for them:</div>
                      {(debugLines[d.providerId] === "loading" ? ["Asking Geotab…"] : (debugLines[d.providerId] as string[] | undefined) ?? ["No further detail was returned."]).map((l, i) => <div key={i} style={{ marginTop: 2, color: muted }}>• {l}</div>)}
                      {d.hos && <div style={{ marginTop: 4 }}>Hours are known, so the driver exists: {hosText(d.hos).text}</div>}
                      <div style={{ marginTop: 4 }}>Searching the unit number instead works if you know the truck.</div>
                    </div>
                  )}
                  {hosT && <div className="dash-num" style={{ fontSize: 12, marginTop: 3, color: hosT.color }}>Hours · {hosT.text}</div>}
                  {p && !p.truckId && <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>That vehicle isn't set up as a ProTankr truck. Tap to see it anyway.</div>}
                </button>
                {p?.lat != null && p?.lon != null && (
                  <a href={mapsUrl(p.lat, p.lon)} target="_blank" rel="noopener noreferrer"
                    style={{ display: "block", padding: "6px 12px 10px", fontSize: 12, fontWeight: 800, color: "#93c5fd", textDecoration: "none" }}>Open in Maps</a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {submitted.length >= 2 && geoVehicles.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>Vehicles in Geotab</div>
          {geoVehicles.map((v) => (
            <button key={v.vehicleId} type="button"
              onClick={() => (v.truckId ? openTruck(v.truckId) : setPick({ truckId: null, trailerId: null, vehicle: { id: v.vehicleId, name: v.name } }))}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 8, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", cursor: "pointer" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{v.name}{!v.truckId && <span style={{ fontSize: 11, fontWeight: 700, color: muted, marginLeft: 8 }}>not set up in ProTankr</span>}</div>
              <div style={{ fontSize: 13, marginTop: 3 }}>
                {v.driverName ? <>{v.signedIn ? "Driver" : "Last driver"} <b>{v.driverName}</b> · </> : null}
                {v.speedMph != null && v.speedMph > 2 ? `moving ${v.speedMph} mph` : "stopped"}
                <span style={{ color: muted }}> · {ageText(v.at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && trucks.length === 0 && <div style={{ fontSize: 14, color: muted }}>Loading equipment…</div>}

      {rows.combos.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: "4px 0 6px" }}>Pairings · {rows.combos.length}</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {rows.combos.map((c) => (
              <div key={c.comboId} style={{ display: "grid", gridTemplateColumns: "1fr 26px 1fr", alignItems: "center" }}>
                <UnitCard u={c.truck} mine={mine(c.truck.id, c.trailer.id)} onClick={() => setPick({ truckId: c.truck.id, trailerId: c.trailer.id })} />
                <div aria-hidden style={{ height: 2, background: "rgba(255,255,255,0.45)" }} />
                <UnitCard u={c.trailer} mine={mine(c.truck.id, c.trailer.id)} onClick={() => setPick({ truckId: c.truck.id, trailerId: c.trailer.id })} />
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: "4px 0 6px" }}>Trucks · {rows.trucks.length}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.trucks.map((t) => <UnitCard key={t.id} u={t} mine={t.id === myTruckId} onClick={() => setPick({ truckId: t.id, trailerId: null })} />)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, margin: "4px 0 6px" }}>Trailers · {rows.trailers.length}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.trailers.map((t) => <UnitCard key={t.id} u={t} mine={t.id === myTrailerId} onClick={() => setPick({ truckId: null, trailerId: t.id })} />)}
          </div>
        </div>
      </div>
      {!loading && rows.combos.length + rows.trucks.length + rows.trailers.length === 0 && (
        <div style={{ fontSize: 14, color: muted, marginTop: 12 }}>Nothing matches{filtered ? " this filter" : ""}.</div>
      )}

      {companyId && (
        <RegionLocalAreaFilterModal open={filterOpen} onClose={() => setFilterOpen(false)} companyId={companyId} canManage={canManage} filter={filter} onChange={setFilter} />
      )}

      {pick && companyId && (
        <TrackDetail
          open onClose={() => setPick(null)} companyId={companyId}
          truck={detailTruck} trailer={detailTrailer} vehicle={pick.vehicle ?? null} allTrucks={trucks}
          onChanged={() => void reload()}
          onSwitchTruck={(id) => openTruck(id)}
        />
      )}
    </FullscreenModal>
  );
}
