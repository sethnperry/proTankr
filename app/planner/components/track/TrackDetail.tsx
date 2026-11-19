"use client";
// app/planner/components/track/TrackDetail.tsx
//
// One truck, one trailer or a pairing, built from ProTankr's own records: the status each unit was given and the story
// of how (who, when, where), who has it now and who ran it last, what it is coupled to, where it was last captured
// (the phone's GPS at an event, see lib/position) and the load it is on. STUD sets the status. The only Geotab surface
// is the "Track in Geotab" link for people who want the live map.

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { fetchTruckTrip } from "@/lib/trips/fetchTruckTrip";
import { summarizeTruckTrip, type TruckTripSummary } from "@/lib/trips/truckTrip";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { productColorFor } from "../../utils/productColor";
import { ageText, clockOf } from "@/lib/equipment/trackFormat";
import { useEquipmentPositions } from "@/lib/position/useEquipmentPositions";
import { useGeotabLink } from "@/lib/telematics/useGeotabLink";
import { useUnitHolder } from "@/lib/equipment/useUnitHolder";
import { CapturedPosition } from "./CapturedPosition";
import type { TrackUnit } from "@/lib/equipment/trackList";
import EquipmentStatusModal, { fleetStatusColor, fleetStatusLabel, type FleetStatus } from "../../modals/EquipmentStatusModal";
import { muted } from "../trip/tripUi";
import { fetchStatusStory, storyLine, type StatusStory } from "@/lib/equipment/statusStory";
import type { StoryPin } from "./UnitStoryMap";

const UnitStoryMap = dynamic(() => import("./UnitStoryMap"), { ssr: false });

const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted };
const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.14)", padding: 14, marginBottom: 12 };
const rule: React.CSSProperties = { marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" };
const bigBtn: React.CSSProperties = { display: "block", textAlign: "center", padding: "13px 0", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: "none" };
const verbFor = (code: string | null) => code === "deadline" ? "Deadlined" : code === "readyline" ? "Marked Readyline" : code === "in_use" ? "Set in use" : "Status set";

export function TrackDetail({ open, onClose, companyId, truck, trailer, story = false, coupledWith, coupledKnown = false, onOpenCoupled, onChanged }: {
  open: boolean; onClose: () => void; companyId: string;
  truck: TrackUnit | null; trailer: TrackUnit | null;
  /** One unit and the story of how it got its status. `coupledWith` is its partner; `coupledKnown` says whether to claim "not coupled" when there is none. */
  story?: boolean; coupledWith?: TrackUnit | null; coupledKnown?: boolean; onOpenCoupled?: () => void;
  onChanged: () => void;
}) {
  const [trip, setTrip] = useState<TruckTripSummary | null>(null);
  const [tripDone, setTripDone] = useState(false);
  const [statusUnit, setStatusUnit] = useState<TrackUnit | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [told, setTold] = useState<StatusStory | null>(null);
  const { data: catalog } = useProductsCatalog();
  const captured = useEquipmentPositions(companyId, open, 30_000);
  const focus = story ? (truck ?? trailer) : null;

  // The truck whose page "Track in Geotab" opens: this truck, or the truck a trailer is coupled to (a trailer has no tracker).
  const linkTruckId = truck?.id ?? (coupledWith?.kind === "truck" ? coupledWith.id : null);
  const geotabHref = useGeotabLink(companyId, linkTruckId, open && !!linkTruckId);

  useEffect(() => {
    if (!open || !focus) { setTold(null); return; }
    let off = false;
    void fetchStatusStory(focus.kind, focus.id, companyId, focus.statusUpdatedAt).then((s) => { if (!off) setTold(s); });
    return () => { off = true; };
  }, [open, focus?.id, focus?.statusUpdatedAt, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The load the truck is on (company trips; no tracker needed). Where it is comes from the last capture.
  const tripTruckId = truck?.id ?? null;
  const tripPos = tripTruckId ? captured.byUnit.get(`truck:${tripTruckId}`) : undefined;
  useEffect(() => {
    if (!open || !tripTruckId) { setTrip(null); setTripDone(false); return; }
    let off = false;
    setTripDone(false);
    void fetchTruckTrip(tripTruckId).then((td) => {
      if (off) return;
      setTrip(td ? summarizeTruckTrip({ ...td, pos: tripPos ? { lat: tripPos.lat, lon: tripPos.lon } : null, nowMs: Date.now() }) : null);
      setTripDone(true);
    });
    return () => { off = true; };
  }, [open, tripTruckId, tripPos?.capturedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const pins = useMemo<StoryPin[]>(() => {
    const out: StoryPin[] = [];
    const sc = focus?.statusCode ?? null;
    const there = told?.lat != null && told?.lon != null ? { lat: told.lat, lon: told.lon } : null;
    const cap = focus ? captured.byUnit.get(`${focus.kind}:${focus.id}`) : undefined;
    const now = cap ? { lat: cap.lat, lon: cap.lon } : null;
    const metres = there && now ? Math.hypot((there.lat - now.lat) * 111_320, (there.lon - now.lon) * 111_320 * Math.cos(there.lat * Math.PI / 180)) : null;
    if (there) out.push({ key: "there", ...there, label: metres != null && metres < 50 ? `${focus?.name} · ${verbFor(sc).toLowerCase()} here, still here` : `${focus?.name} · ${verbFor(sc).toLowerCase()} here`, sub: told?.placeLabel ?? focus?.statusLocation ?? "Saved location", color: "#f87171" });
    if (now && !(metres != null && metres < 50)) out.push({ key: "now", ...now, label: `${focus?.name} · now`, sub: `Last captured · ${ageText(cap?.capturedAt ?? null)}`, color: "#60a5fa" });
    return out;
  }, [told, captured.byUnit, focus]);

  const title = story && focus ? `${focus.kind === "truck" ? "Truck" : "Trailer"} ${focus.name}` : [truck ? `Truck ${truck.name}` : null, trailer ? `Trailer ${trailer.name}` : null].filter(Boolean).join(" · ");

  const whoHasIt = (u: TrackUnit) => <WhoHasIt unit={u} open={open} />;
  const statusLine = (u: TrackUnit) => (
    <span style={{ fontSize: 14, fontWeight: 900, color: u.statusCode ? fleetStatusColor(u.statusCode) : muted }}>● {u.statusCode ? fleetStatusLabel(u.statusCode) || u.statusCode : "No status"}{u.subStatus ? ` · ${u.subStatus}` : ""}</span>
  );

  const storyCard = (u: TrackUnit) => (
    <div key={u.id} style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 900 }}>{u.kind === "truck" ? "Truck" : "Trailer"} {u.name}</span>
        <span style={{ flex: 1 }} />
        {statusLine(u)}
      </div>
      <div style={{ fontSize: 14, marginTop: 8 }}>{told ? storyLine(verbFor(u.statusCode), told) : u.statusUpdatedAt ? storyLine(verbFor(u.statusCode), { byName: null, at: u.statusUpdatedAt, source: null }) : "No status history on file."}</div>
      {told && !told.byName && u.statusUpdatedAt && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Who set it wasn't recorded.</div>}

      {(coupledWith || coupledKnown) && (
        <div style={rule}>
          <div style={label}>Coupled to</div>
          {coupledWith ? (
            <button type="button" onClick={onOpenCoupled} disabled={!onOpenCoupled}
              style={{ display: "flex", alignItems: "baseline", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, marginTop: 4, color: "#fff", cursor: onOpenCoupled ? "pointer" : "default" }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>{coupledWith.kind === "truck" ? "Truck" : "Trailer"} {coupledWith.name}</span>
              <span style={{ fontSize: 13, color: coupledWith.statusCode ? fleetStatusColor(coupledWith.statusCode) : muted }}>● {coupledWith.statusCode ? fleetStatusLabel(coupledWith.statusCode) || coupledWith.statusCode : "No status"}</span>
              {onOpenCoupled && <span style={{ marginLeft: "auto", color: muted }}>›</span>}
            </button>
          ) : <div style={{ fontSize: 15, marginTop: 4, color: muted }}>Not coupled to anything.</div>}
        </div>
      )}

      <div style={rule}>{whoHasIt(u)}</div>

      <div style={rule}>
        <div style={label}>{verbFor(u.statusCode)} at</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{u.statusLocation || told?.placeLabel || <span style={{ color: muted, fontWeight: 600 }}>No location saved</span>}</div>
        {told?.lat != null && told?.lon != null && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{told.placeLabel && u.statusLocation && told.placeLabel !== u.statusLocation ? `${told.placeLabel} · ` : ""}{told.lat.toFixed(5)}, {told.lon.toFixed(5)}</div>}
      </div>

      <div style={rule}>
        <div style={label}>Notes from the driver</div>
        <div style={{ fontSize: 15, marginTop: 4, whiteSpace: "pre-wrap", color: u.statusNotes ? "#fff" : muted }}>{u.statusNotes || "Nothing noted."}</div>
        {(u.region || u.localArea || u.currentRegion || u.currentLocalArea) && (
          <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>
            {[u.currentRegion ?? u.region, u.currentLocalArea ?? u.localArea].filter(Boolean).join(" · ")}
            {(u.currentRegion && u.currentRegion !== u.region) || (u.currentLocalArea && u.currentLocalArea !== u.localArea) ? ` (home: ${[u.region, u.localArea].filter(Boolean).join(" · ") || "none"})` : ""}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        <button type="button" disabled={pins.length === 0} onClick={() => setMapOpen(true)}
          style={{ ...bigBtn, flex: "1 1 140px", background: "rgba(255,255,255,0.1)", color: "#fff", opacity: pins.length ? 1 : 0.4 }}>Show on map</button>
        <button type="button" onClick={() => setStatusUnit(u)}
          style={{ ...bigBtn, flex: "0 0 auto", padding: "13px 18px", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)" }}>STUD</button>
      </div>
    </div>
  );

  const unitCard = (u: TrackUnit) => (
    <div key={u.id} style={card}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={label}>{u.kind === "truck" ? "Truck" : "Trailer"} {u.name}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setStatusUnit(u)}
          style={{ border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", padding: "6px 14px", fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer" }}>STUD</button>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 8, color: u.statusCode ? fleetStatusColor(u.statusCode) : "#fff" }}>
        {u.statusCode ? fleetStatusLabel(u.statusCode) || u.statusCode : "No status set"}
        {u.subStatus ? <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}> · {u.subStatus}</span> : null}
      </div>
      {u.statusNotes && <div style={{ fontSize: 13, marginTop: 4, color: "rgba(255,255,255,0.7)" }}>{u.statusNotes}</div>}
      <div style={{ fontSize: 13, marginTop: 6, color: muted }}>
        {u.statusLocation ? <>Last known: <span style={{ color: "#fff" }}>{u.statusLocation}</span>{u.statusUpdatedAt ? ` · ${ageText(u.statusUpdatedAt)}` : ""}</> : "No location on file yet."}
      </div>
      <div style={rule}>{whoHasIt(u)}</div>
    </div>
  );

  return (
    <FullscreenModal open={open} onClose={onClose} title={title || "Track"} footer={null}>
      <CapturedPosition byUnit={captured.byUnit} geotabHref={geotabHref}
        units={[...(truck ? [{ kind: "truck" as const, id: truck.id, name: truck.name }] : []), ...(trailer ? [{ kind: "trailer" as const, id: trailer.id, name: trailer.name }] : [])]} />
      {story && focus ? storyCard(focus) : <>{truck && unitCard(truck)}{trailer && unitCard(trailer)}</>}

      {truck && tripDone && (
        <div style={card}>
          {!trip ? (
            <div style={{ fontSize: 14, color: muted }}>Not on a load right now.</div>
          ) : (
            <>
              <div style={label}>Load</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{trip.status}</div>
              {trip.next && (
                <div style={{ fontSize: 14, marginTop: 6 }}>
                  {trip.next.here ? <>At <b>{trip.next.label}</b></> : <>Next: <b>{trip.next.label}</b>{trip.next.miles != null ? ` · ${trip.next.miles} mi` : ""}</>}
                  {!trip.next.here && trip.next.etaMs != null && <> · ETA <b>{clockOf(trip.next.etaMs)}</b></>}
                </div>
              )}
              {trip.last && <div style={{ fontSize: 14, marginTop: 4 }}>Last stop: <b>{trip.last.label}</b> · ETA <b>{clockOf(trip.last.etaMs)}</b></div>}
              {(trip.next?.etaMs != null || trip.last) && <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>Estimated from the last captured position and straight-line distance, with time at each stop.</div>}
              {trip.products.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
                  {trip.products.map((p) => {
                    const cp = p.productId ? catalog.find((x) => x.product_id === p.productId) : null;
                    const name = cp ? String(cp.display_name || cp.product_name || "Product") : "Product";
                    const hex = typeof cp?.hex_code === "string" && cp.hex_code.trim() ? cp.hex_code.trim() : productColorFor(name);
                    return (
                      <span key={p.comp} style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: hex }} />
                        C{p.comp} {name}{p.gallons ? ` · ${Math.round(p.gallons).toLocaleString("en-US")} gal` : ""}
                      </span>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {story && focus && <UnitStoryMap open={mapOpen} onClose={() => setMapOpen(false)} title={`${focus.kind === "truck" ? "Truck" : "Trailer"} ${focus.name}`} pins={pins} />}

      {statusUnit && (
        <EquipmentStatusModal
          open onClose={() => setStatusUnit(null)} companyId={companyId}
          unitKind={statusUnit.kind} unitId={statusUnit.id} unitName={statusUnit.name}
          currentStatus={statusUnit.statusCode} currentNotes={statusUnit.statusNotes} currentSubStatus={statusUnit.subStatus}
          homeLocalArea={statusUnit.localArea}
          onSaved={(_s: FleetStatus) => { setStatusUnit(null); onChanged(); }}
        />
      )}
    </FullscreenModal>
  );
}

/** Who has the unit now in ProTankr, and who ran it last. */
function WhoHasIt({ unit, open }: { unit: TrackUnit; open: boolean }) {
  const h = useUnitHolder(unit.kind, unit.id, open);
  return (
    <>
      <div style={label}>Driver</div>
      <div style={{ fontSize: 15, marginTop: 4 }}>
        {!h.loaded ? <span style={{ color: muted }}>Checking…</span>
          : h.holder ? <><b>{h.holder.name ?? "A driver"}</b> <span style={{ color: muted }}>has it selected in ProTankr</span></>
          : <span style={{ color: muted }}>Nobody has it selected right now.</span>}
      </div>
      {h.loaded && h.last && <div style={{ fontSize: 13, marginTop: 3, color: muted }}>Last trip: <span style={{ color: "#fff" }}>{h.last.name ?? "a driver"}</span> · {ageText(h.last.at)}</div>}
    </>
  );
}
