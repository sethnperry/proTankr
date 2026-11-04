"use client";
// app/planner/modals/EquipmentStatusModal.tsx
//
// The STUD (status-update) modal for a single truck or trailer -- In Use /
// Deadline / Readyline. Reuses the exact Region-then-scoped-Local-Area
// picker RequiredEquipmentFields.tsx already built for a unit's HOME
// location (exported from there for exactly this reuse) -- here it writes
// the unit's CURRENT location instead (current_region/current_local_area,
// via set_equipment_status), not its permanent home.
//
// Deadline/Readyline both mean "not currently with a driver" -- the RPC
// unlinks the unit from whoever holds it (same _evict_combo_to_partial
// mechanic couple_combo's own per-unit take-over already uses), so Region/
// Local Area are required for those two ("where is it now" only matters
// once it's not with a driver). In Use needs neither -- it's just clearing
// the flag, and coupling the unit for real already re-stamps its current
// location from the driver's own profile.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CatalogPicker } from "@/lib/ui/driver/RequiredEquipmentFields";
import { getPhonePosition } from "@/lib/geo/position";
import { airMiles } from "@/lib/trips/deliveryLocations";
import { mapsUrl } from "@/lib/equipment/parkedNearby";
import dynamic from "next/dynamic";
import type { PinPick, UnitInfo } from "@/app/planner/components/EquipmentPinMap";

const PinMap = dynamic(() => import("@/app/planner/components/EquipmentPinMap"), { ssr: false });

type Pin = { lat: number; lon: number; label: string | null; placeId: string | null; region: string | null; localArea: string | null };

export type FleetStatus = "in_use" | "deadline" | "readyline";

const STATUS_OPTIONS: { value: FleetStatus; label: string; color: string }[] = [
  { value: "in_use",   label: "In Use",    color: "#67e8f9" },
  { value: "deadline",  label: "Deadline",  color: "#f87171" },
  { value: "readyline", label: "Readyline", color: "#4ade80" },
];

export function fleetStatusColor(status: string | null): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color ?? "rgba(255,255,255,0.5)";
}
export function fleetStatusLabel(status: string | null): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? "";
}

const fieldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 4, display: "block",
};

export default function EquipmentStatusModal({
  open, onClose, companyId, unitKind, unitId, unitName, currentStatus, currentNotes,
  currentSubStatus, homeLocalArea, onSaved, presetRegion, presetLocalArea, presetPin, pair, locationOptional = false, allowed, onParkPreloaded,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  unitKind: "truck" | "trailer";
  unitId: string;
  unitName: string;
  currentStatus: string | null;
  currentNotes: string | null;
  /** Free-form catalog pick (equipment_sub_statuses) -- e.g. Maintenance,
   *  Inspection, Available, Parked -- recovers some of the finer-grained
   *  detail the old 8-value vocabulary carried, without reintroducing a
   *  second status vocabulary. */
  currentSubStatus?: string | null;
  /** The unit's PERMANENT home local_area (trucks/trailers.local_area) --
   *  distinct from the current/editable Local Area picker below, which
   *  writes current_local_area instead. Shown for reference only. */
  homeLocalArea?: string | null;
  onSaved: (newStatus: FleetStatus) => void;
  /** Filled in from the nearest saved place when a pin was captured; still editable. */
  presetRegion?: string | null;
  presetLocalArea?: string | null;
  /** Where the unit was just left (End shift stamp). Written with the status; still changeable here. */
  presetPin?: { lat: number; lon: number; label: string | null; placeId: string | null } | null;
  /** A coupled pair is one thing: the status (and the pin) apply to both units together. */
  pair?: { truckId: string; trailerId: string; truckName: string; trailerName: string } | null;
  /** Drop trailer / Park truck: a status is all that's needed, location is optional. */
  locationOptional?: boolean;
  /** Limit the offered statuses (day cab at End shift has no In Use). */
  allowed?: FleetStatus[];
  /** Loaded truck at End shift: shows Park preloaded in place of Readyline. */
  onParkPreloaded?: () => void;
}) {
  const [status, setStatus] = useState<FleetStatus>("in_use");
  const [region, setRegion] = useState("");
  const [localArea, setLocalArea] = useState("");
  const [subStatus, setSubStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [hadPin, setHadPin] = useState<Pin | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [unitInfo, setUnitInfo] = useState<UnitInfo[]>([]);

  // Nearest saved place (within 0.3 mi) names the pin and fills region / local area.
  async function nearestPlace(lat: number, lon: number): Promise<Pick<Pin, "label" | "placeId" | "region" | "localArea">> {
    try {
      const { data } = await supabase.from("delivery_locations").select("location_id, name, lat, lon, region, local_area").eq("company_id", companyId);
      let best: { d: number; r: any } | null = null;
      for (const l of (data ?? []) as any[]) {
        if (l.lat == null || l.lon == null) continue;
        const d = airMiles({ lat, lon }, { lat: Number(l.lat), lon: Number(l.lon) });
        if (d <= 0.3 && (!best || d < best.d)) best = { d, r: l };
      }
      return best ? { label: best.r.name ?? null, placeId: best.r.location_id ?? null, region: best.r.region ?? null, localArea: best.r.local_area ?? null } : { label: null, placeId: null, region: null, localArea: null };
    } catch { return { label: null, placeId: null, region: null, localArea: null }; }
  }

  async function setHere() {
    setLocBusy(true); setErr(null);
    const at = await getPhonePosition(8000);
    if (!at) {
      // No GPS: drop the pin by hand instead.
      setErr("Couldn't get your location, so drop the pin on the map.");
      setLocBusy(false); setMapOpen(true); return;
    }
    setPin({ lat: at.lat, lon: at.lon, ...(await nearestPlace(at.lat, at.lon)) });
    setLocBusy(false);
  }

  async function usePinResult(r: PinPick) {
    setErr(null);
    const near = await nearestPlace(r.lat, r.lon);
    const addr = [r.address, r.city, r.state].filter(Boolean).join(", ");
    setPin({ lat: r.lat, lon: r.lon, ...near, label: near.label ?? (addr || null) });
  }
  async function loadUnitInfo() {
    const list: UnitInfo[] = [];
    try {
      const t = pair ? pair.truckId : unitKind === "truck" ? unitId : null;
      const r = pair ? pair.trailerId : unitKind === "trailer" ? unitId : null;
      if (t) { const { data } = await supabase.from("trucks").select("make,model,year").eq("truck_id", t).maybeSingle(); list.push({ kind: "truck", name: pair?.truckName ?? unitName, ...(data as any) }); }
      if (r) { const { data } = await supabase.from("trailers").select("make,model,year").eq("trailer_id", r).maybeSingle(); list.push({ kind: "trailer", name: pair?.trailerName ?? unitName, ...(data as any) }); }
    } catch { /* label only */ }
    setUnitInfo(list);
  }

  useEffect(() => {
    if (!open) return;
    setPin(null); setHadPin(null); setMapOpen(false);
    void loadUnitInfo();
    const ids = pair ? [["truck", pair.truckId], ["trailer", pair.trailerId]] : [[unitKind, unitId]];
    void (async () => {
      if (presetPin) setPin({ ...presetPin, ...(await nearestPlace(presetPin.lat, presetPin.lon)), label: presetPin.label, placeId: presetPin.placeId });
      try {
        const { data } = await supabase.from("equipment_parks").select("unit_kind, unit_id, lat, lon, place_label, place_id").in("unit_id", ids.map((x) => x[1]));
        const r = ((data ?? []) as any[])[0];
        if (r) setHadPin({ lat: r.lat, lon: r.lon, label: r.place_label ?? null, placeId: r.place_id ?? null, region: null, localArea: null });
      } catch { /* no pin on file */ }
    })();
    const first = (allowed?.[0] ?? "in_use") as FleetStatus;
    const cur = currentStatus as FleetStatus;
    setStatus(cur && (!allowed || allowed.includes(cur)) ? cur : first);
    setRegion(presetRegion ?? "");
    setLocalArea(presetLocalArea ?? "");
    setSubStatus(currentSubStatus ?? "");
    setNotes(currentNotes ?? "");
    setErr(null);
  }, [open, currentStatus, currentNotes, currentSubStatus]);

  const offDuty = status === "deadline" || status === "readyline";
  const needsLocation = offDuty && !locationOptional;

  const shownPin = pin ?? hadPin;

  async function save() {
    if (needsLocation && !shownPin) {
      setErr("Set the location first: tap + Set location while you're at the equipment.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const units: ["truck" | "trailer", string][] = pair ? [["truck", pair.truckId], ["trailer", pair.trailerId]] : [[unitKind, unitId]];
      for (const [kind, id] of units) {
        const { error } = await supabase.rpc("set_equipment_status", {
          p_unit_kind: kind,
          p_unit_id: id,
          p_status: status,
          p_region: (pin?.region ?? presetRegion ?? "").trim() || null,
          p_local_area: (pin?.localArea ?? presetLocalArea ?? "").trim() || null,
          p_notes: notes.trim() || null,
          p_sub_status: subStatus.trim() || null,
        });
        if (error) throw error;
      }
      // A new pin is written with the status; the units' old pin stays if none was set. Units in use have none.
      if (pin && offDuty) {
        try {
          await supabase.rpc("park_equipment", {
            p_truck_id: units.find((u) => u[0] === "truck")?.[1] ?? null,
            p_trailer_id: units.find((u) => u[0] === "trailer")?.[1] ?? null,
            p_lat: pin.lat, p_lon: pin.lon, p_label: pin.label, p_place_id: pin.placeId,
          });
        } catch { /* the pin is a convenience; the status already saved */ }
      }
      onSaved(status);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <FullscreenModal open={open} onClose={onClose} title={`Status · ${pair ? `${pair.truckName} / ${pair.trailerName}` : unitName}`} footer={null}>
      <div style={{ display: "grid", gap: 16 }}>
        {err && (
          <div style={{ borderRadius: 2, padding: 12, background: "rgba(180,40,40,0.18)", border: "1px solid rgba(180,40,40,0.32)", color: "rgba(255,255,255,0.92)", fontSize: 13, fontWeight: 700 }}>
            {err}
          </div>
        )}

        <div>
          <label style={fieldLabel}>Status</label>
          <div style={{ display: "grid", gap: 8 }}>
            {STATUS_OPTIONS.filter((o) => (!allowed || allowed.includes(o.value)) && !(onParkPreloaded && o.value === "readyline")).map((o) => {
              const sel = status === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    // Sub-status's valid list is scoped by which top status
                    // is picked (Deadline vs Readyline) -- a value valid
                    // under the old status can be meaningless under the new
                    // one (e.g. "Available" under Deadline), so clear it,
                    // same reasoning as Region clearing Local Area above.
                    if (o.value !== status) setSubStatus("");
                    setStatus(o.value);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                    borderRadius: 2, cursor: "pointer", textAlign: "left" as const,
                    border: sel ? `1px solid ${o.color}` : "1px solid rgba(255,255,255,0.12)",
                    background: sel ? `${o.color}22` : "rgba(255,255,255,0.04)",
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: o.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: sel ? o.color : "rgba(255,255,255,0.85)" }}>{o.label}</span>
                </button>
              );
            })}
            {onParkPreloaded && (
              <button type="button" onClick={() => { onClose(); onParkPreloaded(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 2, cursor: "pointer", textAlign: "left" as const, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#60a5fa", flexShrink: 0 }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>Park preloaded</span>
              </button>
            )}
          </div>
        </div>

        {offDuty || shownPin ? (
          <div>
            <label style={fieldLabel}>Location{needsLocation ? " *" : ""}</label>
            {shownPin && (
              <div style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
                {shownPin.label ? <b>{shownPin.label}</b> : <span style={{ color: "rgba(255,255,255,0.7)" }}>Pinned on the map</span>}
                {" · "}
                <a href={mapsUrl(shownPin.lat, shownPin.lon)} target="_blank" rel="noopener noreferrer" style={{ color: "#93c5fd", fontWeight: 800, textDecoration: "none" }}>
                  {shownPin.lat.toFixed(5)}, {shownPin.lon.toFixed(5)}
                </a>
                {pin && <span style={{ color: "#4ade80", fontWeight: 800 }}> · new</span>}
              </div>
            )}
            <button type="button" onClick={setHere} disabled={locBusy} aria-busy={locBusy}
              style={{ width: "100%", padding: "12px 14px", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" as const }}>
              {locBusy ? "Getting location…" : shownPin ? "📍 Update location (GPS)" : "📍 + Set location (GPS)"}
            </button>
            <button type="button" onClick={() => setMapOpen(true)}
              style={{ width: "100%", marginTop: 8, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" as const }}>
              🗺 Fine-tune on map · street, city, state
            </button>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>GPS uses your phone's position. Not where the equipment is? Fine-tune on the map: move the pin, pick a saved place, or type the address.</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Pick Deadline or Readyline to set where it is parked.</div>
        )}

        {homeLocalArea && (
          <div style={{ textAlign: "right" as const, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginTop: -8 }}>
            Belongs to - {homeLocalArea}
          </div>
        )}

        {/* Sub-status only means anything once the unit is actually
            Deadline or Readyline (it describes WHY it's off-duty or WHY
            it's ready) -- same gate as Region/Local Area above. Scoped to
            this unit's kind (truck/trailer) and to whichever of
            Deadline/Readyline is currently picked, so "Available" can
            never show up under Deadline and vice versa. */}
        {offDuty && (
          <CatalogPicker
            label="Sub-Status (optional)" placeholder="Select sub-status"
            value={subStatus} onChange={setSubStatus}
            table="equipment_sub_statuses" idCol="sub_status_id" companyId={companyId} editable
            matchColumns={{ unit_kind: [unitKind, "both"], status_scope: [status, "both"] }}
            insertColumns={{ unit_kind: unitKind, status_scope: status }}
          />
        )}

        <div>
          <label style={fieldLabel}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Repair ticket #, contact, ETA…"
            style={{
              width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.3)", padding: "10px 11px", fontSize: 14, color: "#fff",
              boxSizing: "border-box" as const, minHeight: 72, resize: "vertical" as const, fontFamily: "inherit",
            }}
          />
        </div>

        <button aria-busy={!!(busy)}
          type="button"
          onClick={save}
          disabled={busy}
          style={{
            width: "100%", padding: "14px 18px", borderRadius: 2, border: "none",
            background: "#fff", color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer",
          }}
        >
          {busy ? "Saving…" : "Save Status"}
        </button>
      </div>
    </FullscreenModal>
    <PinMap open={mapOpen} start={shownPin ? { lat: shownPin.lat, lon: shownPin.lon } : null} initialQuery=""
      unitLabel={pair ? `${pair.truckName} / ${pair.trailerName}` : unitName} units={unitInfo} companyId={companyId}
      onUse={(r) => void usePinResult(r)} onClose={() => setMapOpen(false)} />
    </>
  );
}
