"use client";
// app/planner/components/track/TrackSheet.tsx
//
// Track: look up a piece of equipment or a driver. The list is laid out like the equipment
// picker: pairings first (truck and trailer on one row, numerically by truck so the connector
// runs straight across), then loose trucks, then loose trailers, with the same Region / Local
// Area / Away filter. Each card shows the unit's last known status. Typing also finds drivers
// on the company roster and the equipment they have selected in ProTankr. Picking anything
// opens the Track detail. Everything here is ProTankr's own data; Geotab is only a link in the detail.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import RegionLocalAreaFilterModal, { type EquipmentFilter } from "../../modals/RegionLocalAreaFilterModal";
import { fleetStatusColor, fleetStatusLabel } from "../../modals/EquipmentStatusModal";
import { buildTrackRows, type TrackCombo, type TrackUnit } from "@/lib/equipment/trackList";
import { ageText } from "@/lib/equipment/trackFormat";
import { useCompanyRoster } from "../../hooks/useCompanyRoster";
import { useEquipmentPositions } from "@/lib/position/useEquipmentPositions";
import { fieldInput, muted } from "../trip/tripUi";
import { TrackDetail } from "./TrackDetail";
import { EquipmentBoard } from "../equipment/EquipmentBoard";
import { useEquipmentBoardStatus } from "../../hooks/useEquipmentBoardStatus";
import { buildPins, type ParkRow } from "@/lib/equipment/parkedPins";

const ParkedMap = dynamic(() => import("./ParkedMap"), { ssr: false });

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
  const [claimedByCombo, setClaimedByCombo] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<EquipmentFilter>({ region: null, localArea: null, awayOnly: false });
  const [filterOpen, setFilterOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [parks, setParks] = useState<ParkRow[]>([]);
  const [parkNames, setParkNames] = useState<Map<string, string>>(new Map());
  const [pick, setPick] = useState<{ truckId: string | null; trailerId: string | null } | null>(null);
  const [holders, setHolders] = useState<{ userId: string; truckId: string | null; trailerId: string | null }[]>([]);

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const sel = (kind: "truck" | "trailer") => COLS.replace("id,", `${kind}_id,`).replace("name,", `${kind}_name,`);
    const [t, r, c] = await Promise.all([
      supabase.from("trucks").select(sel("truck")).eq("company_id", companyId),
      supabase.from("trailers").select(sel("trailer")).eq("company_id", companyId),
      supabase.from("equipment_combos").select("combo_id, truck_id, trailer_id, claimed_by").eq("company_id", companyId).eq("active", true),
    ]);
    setTrucks(((t.data ?? []) as any[]).filter((x) => x.active !== false).map((x) => toUnit(x, "truck")));
    setTrailers(((r.data ?? []) as any[]).filter((x) => x.active !== false).map((x) => toUnit(x, "trailer")));
    setCombos(((c.data ?? []) as any[]).filter((x) => x.truck_id && x.trailer_id).map((x) => ({ comboId: x.combo_id, truckId: x.truck_id, trailerId: x.trailer_id })));
    setClaimedByCombo(Object.fromEntries(((c.data ?? []) as any[]).map((x) => [x.combo_id, x.claimed_by ?? null])));
    // Who has a truck or trailer alone (bobtail / trailer only). Skipped quietly if this role can't read it.
    try {
      const h = await supabase.from("user_settings").select("user_id, current_truck_id, current_trailer_id").or("current_truck_id.not.is.null,current_trailer_id.not.is.null");
      setHolders(((h.data ?? []) as any[]).map((x) => ({ userId: x.user_id, truckId: x.current_truck_id ?? null, trailerId: x.current_trailer_id ?? null })));
    } catch { setHolders([]); }
    // Where parked units are (one pin per unit; the database drops it when anyone takes the unit).
    const pk = await supabase.from("equipment_parks").select("unit_kind, unit_id, lat, lon, place_label, parked_by, parked_at").eq("company_id", companyId);
    const rowsPk = ((pk.data ?? []) as ParkRow[]);
    setParks(rowsPk);
    const who = Array.from(new Set(rowsPk.map((x) => x.parked_by).filter((x): x is string => !!x)));
    if (who.length) {
      const n = await supabase.rpc("get_display_names_full", { p_user_ids: who });
      setParkNames(new Map(((n.data ?? []) as any[]).map((r) => [`user:${r.user_id}`, r.display_name as string])));
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { if (open) { setQ(""); void reload(); } }, [open, reload]);

  const rows = useMemo(() => buildTrackRows(trucks, trailers, combos, { region: filter.region, localArea: filter.localArea, awayOnly: filter.awayOnly }, q), [trucks, trailers, combos, filter, q]);
  const truckById = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks]);
  const trailerById = useMemo(() => new Map(trailers.map((t) => [t.id, t])), [trailers]);
  const unitNames = useMemo(() => {
    const m = new Map<string, string>();
    trucks.forEach((t) => m.set(`truck:${t.id}`, t.name)); trailers.forEach((t) => m.set(`trailer:${t.id}`, t.name));
    return m;
  }, [trucks, trailers]);
  const unitMatches = useCallback((kind: "truck" | "trailer", id: string) => {
    const u = (kind === "truck" ? truckById : trailerById).get(id);
    if (!u) return false; // inactive or unknown units don't get a pin
    if (filter.region && u.region !== filter.region) return false;
    if (filter.localArea && u.localArea !== filter.localArea) return false;
    return true;
  }, [truckById, trailerById, filter.region, filter.localArea]);
  const pins = useMemo(() => buildPins(parks, unitNames, unitMatches), [parks, unitNames, unitMatches]);
  const filtered = !!(filter.region || filter.localArea || filter.awayOnly);

  const openTruck = (truckId: string) => {
    const combo = combos.find((c) => c.truckId === truckId);
    setPick({ truckId, trailerId: combo?.trailerId ?? null });
  };
  const { members } = useCompanyRoster(companyId);
  const captured = useEquipmentPositions(companyId, open, 60_000);
  // Drivers matching the search, with the unit they hold: a claimed pairing, or a truck / trailer held alone.
  const driverHits = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [] as { userId: string; name: string; truckId: string | null; trailerId: string | null }[];
    const claimed = new Map<string, { truckId: string | null; trailerId: string | null }>();
    for (const c of combos) { const u = claimedByCombo[c.comboId]; if (u) claimed.set(u, { truckId: c.truckId, trailerId: c.trailerId }); }
    for (const h of holders) if (!claimed.has(h.userId)) claimed.set(h.userId, { truckId: h.truckId, trailerId: h.trailerId });
    return members.filter((m) => m.display_name.toLowerCase().includes(term)).slice(0, 8).map((m) => ({ userId: m.user_id, name: m.display_name, truckId: claimed.get(m.user_id)?.truckId ?? null, trailerId: claimed.get(m.user_id)?.trailerId ?? null }));
  }, [q, members, combos, claimedByCombo, holders]);
  const canManage = role === "admin" || role === "dispatch" || role === "lead";
  const detailTruck = pick?.truckId ? truckById.get(pick.truckId) ?? null : null;
  const detailTrailer = pick?.trailerId ? trailerById.get(pick.trailerId) ?? null : null;
  // One unit at a time, with what it is coupled to: a truck (or a trailer alone) is the subject, its partner a line.
  const storyOn = !!(detailTruck || detailTrailer);
  const subjectTruck = detailTruck;
  const subjectTrailer = detailTruck ? null : detailTrailer;
  const partner: TrackUnit | null = detailTruck
    ? (detailTrailer ?? (combos.find((c) => c.truckId === detailTruck.id) ? trailerById.get(combos.find((c) => c.truckId === detailTruck.id)!.trailerId) ?? null : null))
    : detailTrailer ? (() => { const c = combos.find((x) => x.trailerId === detailTrailer.id); return c ? truckById.get(c.truckId) ?? null : null; })() : null;

  const boardStatus = useEquipmentBoardStatus(open, Object.values(claimedByCombo).filter((x): x is string => !!x), trailers.map((t) => t.id), combos.length, trucks.map((t) => t.id));
  const myCombo = myTruckId ? combos.find((c) => c.truckId === myTruckId) : null;
  const mine = (truckId: string | null, trailerId: string | null) => (!!myTruckId && truckId === myTruckId) || (!!myTrailerId && trailerId === myTrailerId);

  return (
    <FullscreenModal open={open} onClose={onClose} title="Track" footer={null}
      headerRight={
        <button type="button" onClick={() => setFilterOpen(true)}
          style={{ background: "none", border: "none", cursor: "pointer", color: filtered ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 800, letterSpacing: 0.3 }}>
          Filter{filtered ? " •" : ""}
        </button>
      }>
      <div style={{ marginBottom: 12 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Unit number or driver name" enterKeyHint="search" style={{ ...fieldInput, width: "100%", boxSizing: "border-box" }} />
      </div>

      <button type="button" onClick={() => setMapOpen(true)}
        style={{ display: "block", width: "100%", margin: "0 0 12px", padding: "11px 12px", border: "1px solid rgba(255,255,255,0.35)", background: "transparent", color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", textAlign: "left" }}>
        Parked map · {pins.length} spot{pins.length === 1 ? "" : "s"} ›
      </button>

      {myCombo && !q && (
        <button type="button" onClick={() => openTruck(myCombo.truckId)}
          style={{ width: "100%", padding: "11px 12px", marginBottom: 12, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.08)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
          My equipment · {truckById.get(myCombo.truckId)?.name} / {trailerById.get(myCombo.trailerId)?.name} ›
        </button>
      )}

      {driverHits.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted, marginBottom: 6 }}>Drivers</div>
          {driverHits.map((d) => {
            const t = d.truckId ? truckById.get(d.truckId) : null, r = d.trailerId ? trailerById.get(d.trailerId) : null;
            const cap = d.truckId ? captured.byUnit.get(`truck:${d.truckId}`) : r ? captured.byUnit.get(`trailer:${r.id}`) : undefined;
            const tappable = !!(t || r);
            return (
              <button key={d.userId} type="button" disabled={!tappable} onClick={() => (t ? openTruck(t.id) : r ? setPick({ truckId: null, trailerId: r.id }) : undefined)}
                style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 8, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", cursor: tappable ? "pointer" : "default" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{d.name}</div>
                <div style={{ fontSize: 13, marginTop: 3 }}>
                  {t || r ? <>Has <b>{[t ? `Truck ${t.name}` : null, r ? `Trailer ${r.name}` : null].filter(Boolean).join(" / ")}</b> selected{cap ? <span style={{ color: muted }}> · last captured {ageText(cap.capturedAt)}</span> : null}</> : <span style={{ color: muted }}>No equipment selected in ProTankr.</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {loading && trucks.length === 0 && <div style={{ fontSize: 14, color: muted }}>Loading equipment…</div>}

      <EquipmentBoard
        rows={rows}
        claimedByCombo={claimedByCombo}
        initials={boardStatus.initials}
        activity={boardStatus.activity} destByTrailer={boardStatus.destByTrailer} lastPlaceByTrailer={boardStatus.lastPlaceByTrailer}
        strips={boardStatus.strips}
        codes={boardStatus.codesByTrailer} lastBy={boardStatus.parkedByUnit} unconfirmed={boardStatus.unconfirmed} linked={boardStatus.linked}
        mine={{ truckId: myTruckId, trailerId: myTrailerId }}
        loading={loading}
        onCombo={(c) => setPick({ truckId: c.truck.id, trailerId: c.trailer.id })}
        onTruck={(u) => setPick({ truckId: u.id, trailerId: null })}
        onTrailer={(u) => setPick({ truckId: null, trailerId: u.id })}
        emptyNote={`Nothing matches${filtered ? " this filter" : ""}.`}
      />

      <ParkedMap open={mapOpen} onClose={() => setMapOpen(false)} pins={pins}
        nameOf={(id) => (id ? parkNames.get(`user:${id}`) ?? null : null)}
        onOpenUnit={(u) => { setMapOpen(false); setPick(u.kind === "truck" ? { truckId: u.id, trailerId: combos.find((c) => c.truckId === u.id)?.trailerId ?? null } : { truckId: null, trailerId: u.id }); }} />

      {companyId && (
        <RegionLocalAreaFilterModal open={filterOpen} onClose={() => setFilterOpen(false)} companyId={companyId} canManage={canManage} filter={filter} onChange={setFilter} />
      )}

      {pick && companyId && (
        <TrackDetail
          open onClose={() => setPick(null)} companyId={companyId}
          story={storyOn} coupledWith={partner} coupledKnown={storyOn} onOpenCoupled={partner ? () => setPick(partner.kind === "truck" ? { truckId: partner.id, trailerId: null } : { truckId: null, trailerId: partner.id }) : undefined}
          truck={storyOn ? subjectTruck : detailTruck} trailer={storyOn ? subjectTrailer : detailTrailer}
          onChanged={() => void reload()}
        />
      )}
    </FullscreenModal>
  );
}
