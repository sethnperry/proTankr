"use client";
// app/planner/components/freight/FreightSheet.tsx
//
// Freight: begin a van, flatbed or lowboy load (or an LTS route), and finish it. One open load per truck. After
// Delivered the truck is empty until the next load begins or the driver ends it. LTS records a route number, the
// casing and tote counts at each stop, a photo of the signed manifest and the receiver's signature. Odometer and
// counts only: no pay. The rules are in lib/freight/freight.ts.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { SignaturePad } from "@/lib/ui/SignaturePad";
import { CaptureSheet } from "../capture/CaptureSheet";
import { beginProblem, deliverProblem, emptyMiles, isEmptyNow, kindLabel, loadedMiles, TRAILER_KINDS, type Load, type Stop, type TrailerKind } from "@/lib/freight/freight";
import type { BeginArgs, DeliverArgs } from "../../hooks/useFreight";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", fontSize: 16, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box", marginBottom: 8 };
const lab: React.CSSProperties = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "6px 0 4px" };
const primary: React.CSSProperties = { width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", marginTop: 6 };
const chip = (on: boolean): React.CSSProperties => ({ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 800, border: `1px solid ${on ? "#fff" : HAIR}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff", cursor: "pointer" });
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export function FreightSheet({ open, onClose, companyId, userId, truck, coupledTrailer, liveOdometer, loads, stopsOf, onBegin, onDeliver, onEndEmpty, onCancel }: {
  open: boolean; onClose: () => void; companyId: string | null; userId: string | null;
  truck: { id: string; name: string } | null; coupledTrailer: { id: string; name: string } | null; liveOdometer: number | null;
  loads: Load[]; stopsOf: (id: string) => Stop[];
  onBegin: (a: BeginArgs) => string | null; onDeliver: (a: DeliverArgs) => void; onEndEmpty: (id: string, odo: string) => void; onCancel: (id: string) => void;
}) {
  const openLoad = truck ? loads.find((l) => l.status === "open" && l.truck_id === truck.id) ?? null : null;
  const lastDone = truck ? [...loads].filter((l) => l.truck_id === truck.id && l.status === "delivered").sort((a, b) => (b.delivered_at ?? "").localeCompare(a.delivered_at ?? ""))[0] ?? null : null;
  const empty = lastDone && isEmptyNow(lastDone) ? lastDone : null;
  const guessOdo = liveOdometer != null ? String(Math.round(liveOdometer)) : lastDone?.end_odometer != null ? String(lastDone.end_odometer) : "";

  const [preset, setPreset] = useState<"standard" | "lts">("standard");
  const [kind, setKind] = useState<TrailerKind | null>(null);
  const [label, setLabel] = useState("");
  const [odo, setOdo] = useState("");
  const [ref, setRef] = useState("");
  const [customer, setCustomer] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [route, setRoute] = useState("");
  const [endOdo, setEndOdo] = useState("");
  const [stops, setStops] = useState<{ name: string; casings: string; totes: string }[]>([{ name: "", casings: "", totes: "" }]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const [emptyOdo, setEmptyOdo] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  // A coupled tanker isn't a freight trailer: the driver can say the load rides on something else.
  const [other, setOther] = useState(false);
  const usingCoupled = !!coupledTrailer && !other;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPreset("standard"); setKind(null); setLabel(""); setOdo(guessOdo); setRef(""); setCustomer(""); setFrom(""); setTo(""); setRoute("");
    setEndOdo(guessOdo); setStops([{ name: "", casings: "", totes: "" }]); setPhotos([]); setSig(null); setEmptyOdo(guessOdo); setConfirmCancel(false); setOther(false); setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const begin = () => {
    const f = { preset, truckId: truck?.id ?? null, odometer: odo, reference: ref, routeNumber: route, trailerKind: kind, hasCoupledTrailer: usingCoupled };
    const p = beginProblem(f, loads);
    if (p) return setErr(p);
    const id = onBegin({ preset, truckId: truck!.id, trailerId: usingCoupled ? coupledTrailer!.id : null, trailerKind: usingCoupled ? null : kind, trailerLabel: usingCoupled ? coupledTrailer!.name : label, reference: ref, customer, origin: from, destination: to, routeNumber: route, odometer: odo });
    if (!id) return setErr("Couldn't save. Try again.");
    setErr(null);
  };
  const deliver = () => {
    if (!openLoad) return;
    const p = deliverProblem(openLoad, { endOdometer: endOdo, stops, manifestPhotos: photos.length, signed: !!sig });
    if (p) return setErr(p);
    onDeliver({ freightId: openLoad.freight_id, endOdometer: endOdo, stops, manifestPaths: photos, signature: sig, notes: null });
    setErr(null);
  };
  const setStop = (i: number, patch: Partial<(typeof stops)[number]>) => setStops((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <>
      <FullscreenModal open={open && !photoOpen} title="Freight" onClose={onClose} footer={null}>
        {!truck && <div style={{ color: MUTE, fontSize: 15 }}>Pick your truck in Equipment first.</div>}

        {truck && openLoad && (
          <>
            <div style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4ade80" }}>On the road · since {dt(openLoad.begun_at)}</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{openLoad.preset === "lts" ? `LTS route ${openLoad.route_number ?? ""}` : openLoad.reference}</div>
              <div style={{ fontSize: 13, color: MUTE, marginTop: 2 }}>{truck.name} · {[kindLabel(openLoad.trailer_kind), openLoad.trailer_label].filter(Boolean).join(" ") || "trailer"}{openLoad.begin_odometer != null ? ` · began at ${openLoad.begin_odometer.toLocaleString("en-US")} mi` : ""}</div>
              {(openLoad.origin_text || openLoad.destination_text) && <div style={{ fontSize: 13, color: MUTE, marginTop: 2 }}>{openLoad.origin_text} → {openLoad.destination_text}</div>}
            </div>
            <div style={lab}>Ending odometer</div>
            <input style={inp} inputMode="decimal" value={endOdo} onChange={(e) => setEndOdo(e.target.value)} placeholder="Miles" />
            {openLoad.preset === "lts" && (
              <>
                <div style={lab}>Stops · casings and totes</div>
                {stops.map((s, i) => (
                  <div key={i} style={{ border: `1px solid ${HAIR}`, padding: 10, marginBottom: 8, background: "#0f0f10" }}>
                    <input style={inp} placeholder="Stop / store" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input style={{ ...inp, marginBottom: 0 }} inputMode="numeric" placeholder="Casings" value={s.casings} onChange={(e) => setStop(i, { casings: e.target.value })} />
                      <input style={{ ...inp, marginBottom: 0 }} inputMode="numeric" placeholder="Totes" value={s.totes} onChange={(e) => setStop(i, { totes: e.target.value })} />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setStops((xs) => [...xs, { name: "", casings: "", totes: "" }])} style={{ ...chip(false), width: "100%", flex: "none", marginBottom: 10 }}>+ Another stop</button>
                <button type="button" onClick={() => setPhotoOpen(true)} style={{ ...chip(false), width: "100%", flex: "none", marginBottom: 10, color: photos.length ? "#4ade80" : "#fff" }}>
                  {photos.length ? `Signed manifest: ${photos.length} photo${photos.length === 1 ? "" : "s"} ✓` : "Photograph the signed manifest"}
                </button>
                <div style={lab}>Receiver signs</div>
                <div style={{ border: `1px solid ${HAIR}`, background: "#0f0f10", padding: 8, marginBottom: 8 }}><SignaturePad onChange={setSig} /></div>
              </>
            )}
            {err && <div style={{ color: "#f87171", fontSize: 13, margin: "6px 0" }}>{err}</div>}
            <button type="button" style={primary} onClick={deliver}>Delivered</button>
            {!confirmCancel
              ? <button type="button" onClick={() => setConfirmCancel(true)} style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: "#f87171", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Cancel this load</button>
              : <div style={{ marginTop: 12, textAlign: "center", fontSize: 13 }}>Cancel this load? <button type="button" onClick={() => { onCancel(openLoad.freight_id); onClose(); }} style={{ background: "none", border: "none", color: "#f87171", fontWeight: 800, cursor: "pointer" }}>Yes, cancel</button> · <button type="button" onClick={() => setConfirmCancel(false)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Keep</button></div>}
          </>
        )}

        {truck && !openLoad && (
          <>
            {empty && (
              <div style={{ border: "1px solid rgba(251,191,36,0.5)", background: "#0f0f10", padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fbbf24" }}>Empty since {dt(empty.delivered_at)}</div>
                <div style={{ fontSize: 13, color: MUTE, margin: "4px 0 8px" }}>Last load: {loadedMiles(empty) != null ? `${Math.round(loadedMiles(empty)!).toLocaleString("en-US")} mi loaded` : "delivered"}. Beginning the next load ends this automatically.</div>
                <input style={inp} inputMode="decimal" value={emptyOdo} onChange={(e) => setEmptyOdo(e.target.value)} placeholder="Odometer now" />
                <button type="button" style={{ ...primary, background: "transparent", color: "#fff", border: `1px solid ${HAIR}`, padding: "12px 0", marginTop: 0 }} onClick={() => { onEndEmpty(empty.freight_id, emptyOdo); }}>End empty{emptyMiles({ end_odometer: empty.end_odometer, empty_end_odometer: Number(emptyOdo) || null }) != null ? ` · ${Math.round(emptyMiles({ end_odometer: empty.end_odometer, empty_end_odometer: Number(emptyOdo) })!)} mi` : ""}</button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button type="button" style={chip(preset === "standard")} onClick={() => setPreset("standard")}>Freight load</button>
              <button type="button" style={chip(preset === "lts")} onClick={() => setPreset("lts")}>LTS route</button>
            </div>
            <div style={lab}>Trailer</div>
            {usingCoupled
              ? (<>
                  <div style={{ ...inp, display: "block", marginBottom: 4 }}>{coupledTrailer!.name} (coupled)</div>
                  <button type="button" onClick={() => setOther(true)} style={{ background: "none", border: "none", color: MUTE, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "0 0 8px" }}>Riding on a different trailer ›</button>
                </>)
              : (
                <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>{TRAILER_KINDS.map((k) => <button key={k.value} type="button" style={chip(kind === k.value)} onClick={() => setKind(k.value)}>{k.label}</button>)}</div>
                  <input style={inp} placeholder="Trailer number (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
                </>
              )}
            <div style={lab}>Beginning odometer</div>
            <input style={inp} inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} placeholder="Miles" />
            {preset === "lts"
              ? (<><div style={lab}>Route number</div><input style={inp} value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Route" /></>)
              : (<>
                  <div style={lab}>Load / reference number</div><input style={inp} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference" />
                  <div style={lab}>Customer (optional)</div><input style={inp} value={customer} onChange={(e) => setCustomer(e.target.value)} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><div style={lab}>From</div><input style={inp} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="City" /></div>
                    <div><div style={lab}>To</div><input style={inp} value={to} onChange={(e) => setTo(e.target.value)} placeholder="City" /></div>
                  </div>
                </>)}
            {err && <div style={{ color: "#f87171", fontSize: 13, margin: "6px 0" }}>{err}</div>}
            <button type="button" style={primary} onClick={begin}>Begin load</button>
          </>
        )}
      </FullscreenModal>

      <CaptureSheet open={open && photoOpen} purpose="manifest" title="Signed manifest" companyId={companyId} userId={userId} refType="freight_load" refId={openLoad?.freight_id ?? null}
        onDone={(r) => { setPhotos(r.paths); setPhotoOpen(false); }} onClose={() => setPhotoOpen(false)} />
    </>
  );
}
