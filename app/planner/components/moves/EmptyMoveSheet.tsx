"use client";
// app/planner/components/moves/EmptyMoveSheet.tsx
//
// Empty move: the truck going somewhere with no load. Begin with where to (nearby places one tap, or any place),
// end on arrival with the odometer. One open move per driver. Rules: lib/moves/emptyMoves.ts.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { LocationPicker } from "../trip/LocationPicker";
import { locationTitle, nearbyPlaces, type DeliveryLocation, type LatLon, type LocationTank } from "@/lib/trips/deliveryLocations";
import { MOVE_KINDS, moveKindLabel, moveMiles, moveMinutes, suggestKind, type MoveKind, type MovePlace } from "@/lib/moves/emptyMoves";
import type { EmptyMoveRow } from "@/lib/trips/types";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", fontSize: 16, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box", marginBottom: 8 };
const lab: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "10px 0 4px" };
const primary: React.CSSProperties = { width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", marginTop: 10 };
const chip = (on: boolean): React.CSSProperties => ({ padding: "10px 12px", fontSize: 13, fontWeight: 800, border: `1px solid ${on ? "#fff" : HAIR}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff", cursor: "pointer" });
const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export function EmptyMoveSheet({ open, onClose, truck, hasTrailer, liveOdometer, current, recent, locations, tanks, origin, companyId, userId, onBegin, onEnd, onDiscard, onLocationAdded }: {
  open: boolean; onClose: () => void; truck: { id: string; name: string } | null; hasTrailer: boolean; liveOdometer: number | null;
  current: EmptyMoveRow | null; recent: EmptyMoveRow[]; locations: DeliveryLocation[]; tanks: LocationTank[]; origin: LatLon | null;
  companyId: string | null; userId: string | null;
  onBegin: (a: { kind: MoveKind; from: MovePlace; to: MovePlace; beginMiles: number | null }) => void;
  onEnd: (moveId: string, endMiles: number | null, to?: MovePlace) => void; onDiscard: (moveId: string) => void; onLocationAdded: () => void;
}) {
  const [kind, setKind] = useState<MoveKind>("bobtail");
  const [to, setTo] = useState<MovePlace>({ id: null, text: null });
  const [toText, setToText] = useState("");
  const [odo, setOdo] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const guess = liveOdometer != null ? String(Math.round(liveOdometer)) : "";
  const near = useMemo(() => nearbyPlaces(locations, origin), [locations, origin]);
  const nameOf = (id: string | null, text: string | null) => (id ? locations.find((l) => l.location_id === id) : null) ? locationTitle(locations.find((l) => l.location_id === id)!) : text || "—";

  useEffect(() => { if (open) { setKind(suggestKind(hasTrailer)); setTo({ id: null, text: null }); setToText(""); setOdo(guess); setConfirmDiscard(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (s: string) => { const n = Number(s.replace(/,/g, "")); return s.trim() && Number.isFinite(n) ? n : null; };
  const destLabel = to.id ? nameOf(to.id, null) : toText.trim();

  return (
    <FullscreenModal open={open} onClose={onClose} title="Empty move" footer={null}>
      {!truck ? <div style={{ color: MUTE }}>Pick a truck first.</div> : current ? (
        <div>
          <div style={{ fontSize: 12, color: MUTE }}>{moveKindLabel(current.kind)} · {truck.name}</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 2px" }}>To {nameOf(current.to_place_id, current.to_text)}</div>
          <div style={{ color: MUTE, fontSize: 13 }}>Started {new Date(current.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · {fmt(moveMinutes(current))} so far</div>
          <div style={lab}>Odometer at arrival</div>
          <input style={inp} inputMode="decimal" value={odo || guess} onChange={(e) => setOdo(e.target.value)} />
          <button type="button" style={primary} onClick={() => { onEnd(current.move_id, num(odo || guess)); onClose(); }}>Arrived</button>
          {confirmDiscard ? (
            <button type="button" style={{ ...primary, background: "#b91c1c", color: "#fff" }} onClick={() => { onDiscard(current.move_id); onClose(); }}>Yes, cancel this move</button>
          ) : <button type="button" style={{ ...primary, background: "transparent", color: "#fff", border: `1px solid ${HAIR}` }} onClick={() => setConfirmDiscard(true)}>Cancel move</button>}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: MUTE }}>{truck.name}{hasTrailer ? " with a trailer" : " alone"}</div>
          <div style={lab}>Kind</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {MOVE_KINDS.map((k) => <button key={k.id} type="button" style={chip(kind === k.id)} onClick={() => setKind(k.id)}>{k.label}</button>)}
          </div>
          <div style={lab}>Going to</div>
          {near.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {near.map((p) => <button key={p.location_id} type="button" style={chip(to.id === p.location_id)} onClick={() => { setTo({ id: p.location_id, text: null }); setToText(""); }}>{locationTitle(p)} · {p.miles < 0.2 ? "here" : `${p.miles.toFixed(1)} mi`}</button>)}
            </div>
          )}
          <button type="button" style={{ ...chip(false), width: "100%", marginBottom: 8, textAlign: "left" }} onClick={() => setPickOpen(true)}>{to.id ? `✓ ${nameOf(to.id, null)} · change` : "Pick a place…"}</button>
          <input style={inp} placeholder="or type where" value={toText} onChange={(e) => { setToText(e.target.value); setTo({ id: null, text: null }); }} />
          <div style={lab}>Odometer now</div>
          <input style={inp} inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} />
          <button type="button" style={{ ...primary, opacity: destLabel ? 1 : 0.4 }} disabled={!destLabel}
            onClick={() => { onBegin({ kind, from: { id: null, text: null }, to: to.id ? to : { id: null, text: toText }, beginMiles: num(odo) }); onClose(); }}>Start move</button>
          {recent.length > 0 && (
            <>
              <div style={{ ...lab, marginTop: 22 }}>Recent</div>
              {recent.filter((m) => m.ended_at).slice(0, 6).map((m) => (
                <div key={m.move_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${HAIR}`, fontSize: 13 }}>
                  <span>{moveKindLabel(m.kind)} → {nameOf(m.to_place_id, m.to_text)}</span>
                  <span style={{ color: MUTE }}>{fmt(moveMinutes(m))}{moveMiles(m) != null ? ` · ${moveMiles(m)} mi` : ""}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      <LocationPicker open={pickOpen} title="Going to" origin={origin} locations={locations} tanks={tanks} companyId={companyId} userId={userId}
        onPick={(d) => { if (d.locationId) { setTo({ id: d.locationId, text: null }); setToText(""); } setPickOpen(false); }} onClose={() => setPickOpen(false)} onLocationAdded={onLocationAdded} />
    </FullscreenModal>
  );
}
