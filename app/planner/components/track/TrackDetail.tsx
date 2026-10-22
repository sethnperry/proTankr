"use client";
// app/planner/components/track/TrackDetail.tsx
//
// One truck, one trailer or a pairing: where it is, who's driving, the load it's on and the
// last known status of each unit. Stud works on the truck and the trailer separately with
// ProTankr's own logic. "Update from Geotab" reads the telematics, shows what would change
// (including a trailer hookup that no longer matches) and only saves after you acknowledge it.

import React, { useCallback, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { fetchTruckReading, type TruckReading } from "@/lib/telematics/useTruckReading";
import { fetchTruckTrip } from "@/lib/trips/fetchTruckTrip";
import { summarizeTruckTrip, type TruckTripSummary } from "@/lib/trips/truckTrip";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { productColorFor } from "../../utils/productColor";
import { ageText, clockOf, compass, mapsUrl } from "@/lib/equipment/trackFormat";
import { hosText } from "@/lib/telematics/progress";
import type { TrackUnit } from "@/lib/equipment/trackList";
import type { TrackChange } from "@/lib/telematics/trackChanges";
import EquipmentStatusModal, { fleetStatusColor, fleetStatusLabel, type FleetStatus } from "../../modals/EquipmentStatusModal";
import { muted } from "../trip/tripUi";

const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted };
const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.14)", padding: 14, marginBottom: 12 };
const bigBtn: React.CSSProperties = { display: "block", width: "100%", textAlign: "center", padding: "13px 0", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: "none" };

type Preview = { changes: TrackChange[]; canSeparate: boolean; truckId: string; truckName: string; observed: { city: string | null; state: string | null; lat: number | null; lon: number | null; at: string | null; trailerName: string | null } };

export function TrackDetail({ open, onClose, companyId, truck, trailer, allTrucks, onChanged, onSwitchTruck }: {
  open: boolean; onClose: () => void; companyId: string;
  truck: TrackUnit | null; trailer: TrackUnit | null;
  allTrucks: TrackUnit[];
  onChanged: () => void;
  onSwitchTruck: (truckId: string) => void;
}) {
  const [reading, setReading] = useState<TruckReading | null>(null);
  const [trip, setTrip] = useState<TruckTripSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [statusUnit, setStatusUnit] = useState<TrackUnit | null>(null);
  const [updating, setUpdating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [separate, setSeparate] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: catalog } = useProductsCatalog();
  const truckId = truck?.id ?? null;

  const load = useCallback(async (id: string) => {
    setBusy(true); setDone(false);
    const [r, td] = await Promise.all([fetchTruckReading(id), fetchTruckTrip(id)]);
    setReading(r);
    setTrip(td ? summarizeTruckTrip({ ...td, pos: r?.lat != null && r?.lon != null ? { lat: r.lat, lon: r.lon } : null, nowMs: Date.now() }) : null);
    setBusy(false); setDone(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setReading(null); setTrip(null); setDone(false); setMsg(null); setPreview(null);
    if (truckId) void load(truckId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, truckId]);

  async function post(apply: boolean, sep: boolean) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in.");
    const r = await fetch("/api/telematics/track-update", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ companyId, truckId: truck?.id ?? null, trailerId: truck ? null : trailer?.id ?? null, apply, separate: sep }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error ?? "Update failed.");
    return j as any;
  }

  async function startUpdate() {
    setUpdating(true); setMsg(null);
    try {
      const j = await post(false, false);
      if (!j.connected) { setMsg({ ok: false, text: j.why ?? "Can't reach the telematics for this unit." }); return; }
      setSeparate(false);
      setPreview({ changes: j.changes ?? [], canSeparate: !!j.canSeparate, truckId: j.truckId, truckName: j.truckName, observed: j.observed });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? "Update failed." });
    } finally { setUpdating(false); }
  }

  async function confirmUpdate() {
    if (!preview) return;
    setUpdating(true);
    try {
      await post(true, separate);
      const id = preview.truckId;
      setPreview(null);
      onChanged();
      setMsg({ ok: true, text: "Updated from Geotab." });
      if (!truck && id) onSwitchTruck(id); // a trailer was found through its truck
      else if (id) void load(id);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message ?? "Update failed." });
      setPreview(null);
    } finally { setUpdating(false); }
  }

  const hasPos = reading?.lat != null && reading?.lon != null;
  const place = [reading?.city, reading?.state].filter(Boolean).join(", ");
  const title = [truck ? `Truck ${truck.name}` : null, trailer ? `Trailer ${trailer.name}` : null].filter(Boolean).join(" · ");

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
    </div>
  );

  return (
    <FullscreenModal open={open} onClose={onClose} title={title || "Track"} footer={null}>
      {truck && unitCard(truck)}
      {trailer && unitCard(trailer)}

      {truck && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={label}>Live from Geotab</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => truckId && void load(truckId)} disabled={busy} aria-busy={busy}
              style={{ border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", padding: "6px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {busy ? "Fetching…" : "Refresh"}
            </button>
          </div>
          {busy && !reading && <div style={{ fontSize: 14, color: muted, marginTop: 12 }}>Asking Geotab for the last position…</div>}
          {done && !reading && <div style={{ fontSize: 14, color: "#fb923c", marginTop: 12 }}>Can't locate this truck. It isn't linked to a Geotab vehicle, or Geotab didn't answer. Link it in Company Dashboard → Telematics.</div>}
          {reading && !hasPos && <div style={{ fontSize: 14, color: "#fb923c", marginTop: 12 }}>Geotab has no position for this truck yet.</div>}
          {reading && hasPos && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>{place || "Position found"}</div>
              <div style={{ fontSize: 14, marginTop: 4, color: "rgba(255,255,255,0.75)" }}>
                Last update {ageText(reading.at)}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>
                {reading.speedMph != null && reading.speedMph > 2
                  ? <>Moving {reading.speedMph} mph{compass(reading.bearingDeg) ? <> heading {compass(reading.bearingDeg)} <span style={{ color: muted, fontWeight: 600 }}>({reading.bearingDeg}°)</span></> : null}</>
                  : <>Stopped{compass(reading.bearingDeg) ? <span style={{ color: muted, fontWeight: 600 }}> · last heading {compass(reading.bearingDeg)}</span> : null}</>}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={label}>Driver</div>
                <div style={{ fontSize: 15, marginTop: 4 }}>
                  {reading.driverName
                    ? <><b>{reading.driverName}</b> <span style={{ color: muted }}>(signed in to the truck)</span></>
                    : reading.lastDriver
                      ? <><span style={{ color: muted }}>Nobody signed in now. Last signed in: </span><b>{reading.lastDriver.name}</b> <span style={{ color: muted }}>· {ageText(reading.lastDriver.at)}</span></>
                      : reading.heldByName
                        ? <><b>{reading.heldByName}</b> <span style={{ color: muted }}>(has it selected in ProTankr)</span></>
                        : <span style={{ color: muted }}>No driver found for this truck.</span>}
                </div>
                {(reading.driverName || reading.lastDriver) && reading.heldByName && (reading.driverName ?? reading.lastDriver?.name) !== reading.heldByName && (
                  <div style={{ fontSize: 13, marginTop: 4, color: "#fb923c" }}>ProTankr has it selected by {reading.heldByName}.</div>
                )}
                {reading.hos && (() => { const t = hosText(reading.hos); return <div className="dash-num" style={{ fontSize: 13, marginTop: 4, color: t.color }}>Hours · {t.text}</div>; })()}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={label}>Shipments (BOL numbers)</div>
                {reading.shipments && reading.shipments.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {reading.shipments.map((s) => (
                      <span key={s.documentNumber} title={[s.shipperName, s.commodity].filter(Boolean).join(" · ") || undefined}
                        style={{ border: "1px solid rgba(255,255,255,0.3)", padding: "5px 10px", fontSize: 15, fontWeight: 800 }}>
                        {s.documentNumber}
                        {(s.shipperName || s.commodity) && <span style={{ fontSize: 11, fontWeight: 600, color: muted }}> {[s.shipperName, s.commodity].filter(Boolean).join(" · ")}</span>}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 14, marginTop: 4, color: muted }}>None on the truck's Drive app (Assets → Shipments).</div>
                )}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                <div style={label}>Trailers in Geotab</div>
                {reading.geotabTrailers && reading.geotabTrailers.length > 0 ? (
                  <>
                    {reading.geotabTrailers.map((t, i) => (
                      <div key={i} style={{ fontSize: 15, marginTop: 6 }}>
                        <b>{t.name}</b>{" "}
                        <span style={{ color: muted, fontSize: 13 }}>{t.ours ? "ProTankr trailer" : "not a ProTankr trailer"}</span>
                        {t.comment && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{t.comment}</div>}
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>Trailer names and comments exactly as entered in Geotab.</div>
                  </>
                ) : (
                  <div style={{ fontSize: 14, marginTop: 4, color: muted }}>
                    {reading.trailerKnown ? "No trailer attached to this truck in Geotab." : "Geotab isn't reporting any trailer hookups for this company."}
                  </div>
                )}
              </div>

              {(reading.odometerMi != null || reading.fuelLevelPct != null || reading.engineHours != null) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 14 }}>
                  {reading.odometerMi != null && <span><span style={{ color: muted }}>Odometer </span><b>{Math.round(reading.odometerMi).toLocaleString("en-US")} mi</b></span>}
                  {reading.fuelLevelPct != null && <span><span style={{ color: muted }}>Fuel </span><b>{Math.round(reading.fuelLevelPct)}%</b></span>}
                  {reading.engineHours != null && <span><span style={{ color: muted }}>Engine </span><b>{Math.round(reading.engineHours).toLocaleString("en-US")} h</b></span>}
                </div>
              )}
              {done && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
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
                      {(trip.next?.etaMs != null || trip.last) && <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>Estimated from straight-line distance, with time at each stop.</div>}
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
              <div style={{ fontSize: 12, marginTop: 10, color: muted }}>{reading.lat!.toFixed(5)}, {reading.lon!.toFixed(5)}</div>
              <a href={mapsUrl(reading.lat!, reading.lon!)} target="_blank" rel="noopener noreferrer"
                style={{ ...bigBtn, marginTop: 14, background: "rgba(255,255,255,0.1)", color: "#fff", textDecoration: "none", boxSizing: "border-box" }}>
                Open in Maps
              </a>
            </>
          )}
        </div>
      )}

      {!truck && trailer && (
        <div style={{ fontSize: 13, color: muted, marginBottom: 12 }}>
          A trailer has no tracker of its own. Update from Geotab finds it through the truck it's hooked to.
        </div>
      )}

      {msg && <div style={{ fontSize: 14, marginBottom: 10, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
      <button type="button" onClick={() => void startUpdate()} disabled={updating} aria-busy={updating} style={{ ...bigBtn, background: "#fff", color: "#000", opacity: updating ? 0.6 : 1 }}>
        {updating && !preview ? "Reading Geotab…" : "Update from Geotab"}
      </button>

      {/* Acknowledge what will change before anything is saved. */}
      <FullscreenModal open={!!preview} onClose={() => setPreview(null)} title="Update from Geotab" footer={null}>
        {preview && (
          <>
            <div style={{ fontSize: 14, marginBottom: 12, color: "rgba(255,255,255,0.8)" }}>
              Geotab says this about truck {preview.truckName}
              {preview.observed.at ? ` (last position ${ageText(preview.observed.at)})` : ""}. Nothing is saved until you confirm.
            </div>
            {preview.changes.length === 0 && <div style={{ fontSize: 14, color: muted, marginBottom: 12 }}>No position or pairing information to save.</div>}
            {preview.changes.map((c, i) => (
              <div key={i} style={{ ...card, borderColor: c.kind === "hookup" ? "rgba(251,146,60,0.6)" : "rgba(255,255,255,0.14)", fontSize: 14 }}>
                <div style={{ ...label, color: c.kind === "hookup" ? "#fb923c" : muted, marginBottom: 4 }}>{c.kind === "location" ? "Location" : c.kind === "hookup" ? "Trailer hookup" : "Driver"}</div>
                {c.text}
              </div>
            ))}
            {preview.canSeparate && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, margin: "4px 0 14px" }}>
                <input type="checkbox" checked={separate} onChange={(e) => setSeparate(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Also separate the old pairing in ProTankr. The driver keeps the truck; the trailer shows as loose until it's coupled again.</span>
              </label>
            )}
            <button type="button" onClick={() => void confirmUpdate()} disabled={updating} aria-busy={updating} style={{ ...bigBtn, background: "#fff", color: "#000", opacity: updating ? 0.6 : 1 }}>
              {updating ? "Saving…" : "OK, update"}
            </button>
            <button type="button" onClick={() => setPreview(null)} style={{ ...bigBtn, marginTop: 8, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>Cancel</button>
          </>
        )}
      </FullscreenModal>

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
