"use client";
// app/planner/components/trip/TankCheckSheet.tsx
//
// Tank check: a quick reading of a store's tanks outside a delivery (a stop in the neighbourhood, a dispatcher's
// question). Pick the store, type each tank's reading in gallons or inches (kept as typed), add a ticket photo if
// there is one, save. Company trucks only (the caller decides). The rules are in lib/tankchecks/tankChecks.ts.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { LocationPicker } from "./LocationPicker";
import { CaptureSheet } from "../capture/CaptureSheet";
import { checkProblem, tankNameProblem, type CheckEntry, type Unit } from "@/lib/tankchecks/tankChecks";
import { sortTankNames } from "@/lib/trips/tankReadings";
import type { DeliveryLocation, LocationTank } from "@/lib/trips/deliveryLocations";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const inp: React.CSSProperties = { width: "100%", padding: "11px 10px", fontSize: 16, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box" };

export function TankCheckSheet({ open, onClose, locations, tanks, productName, origin, companyId, userId, onLocationAdded, onSave }: {
  open: boolean; onClose: () => void;
  locations: DeliveryLocation[]; tanks: LocationTank[]; productName: (id: string | null) => string;
  origin: { lat: number; lon: number } | null; companyId: string | null; userId: string | null; onLocationAdded: () => void;
  onSave: (a: { locationId: string; locationName: string; entries: CheckEntry[]; productOf: (tank: string) => string | null; paths: string[]; note: string | null }) => boolean;
}) {
  const [loc, setLoc] = useState<DeliveryLocation | null>(null);
  const [pickStore, setPickStore] = useState(false);
  const [entries, setEntries] = useState<CheckEntry[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [newTank, setNewTank] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setLoc(null); setEntries([]); setExtra([]); setNewTank(""); setPaths([]); setNote(""); setErr(null); setPickStore(true); } }, [open]);

  const storeTanks = useMemo(() => (loc ? tanks.filter((t) => t.location_id === loc.location_id && t.is_active !== false) : []), [loc, tanks]);
  const names = useMemo(() => sortTankNames([...new Set([...storeTanks.map((t) => t.tank_number.trim()), ...extra])]), [storeTanks, extra]);
  const productOf = (tank: string) => storeTanks.find((t) => t.tank_number.trim() === tank)?.product_id ?? null;
  const entry = (tank: string): CheckEntry => entries.find((e) => e.tank === tank) ?? { tank, value: "", unit: "gallons", water: "" };
  const put = (tank: string, patch: Partial<CheckEntry>) => setEntries((xs) => [...xs.filter((e) => e.tank !== tank), { ...entry(tank), ...patch }]);

  const save = () => {
    if (!loc) return setErr("Pick the store first.");
    const list = names.map(entry);
    const p = checkProblem(list);
    if (p) return setErr(p);
    const ok = onSave({ locationId: loc.location_id, locationName: loc.name, entries: list, productOf, paths, note: note.trim() || null });
    if (!ok) return setErr("Couldn't save. Try again.");
    onClose();
  };
  const addTank = () => {
    const p = tankNameProblem(newTank, names);
    if (p) return setErr(p);
    setExtra((xs) => [...xs, newTank.trim()]); setNewTank(""); setErr(null);
  };

  return (
    <>
      <FullscreenModal open={open && !pickStore && !photoOpen} title="Tank check" onClose={onClose} footer={null}>
        <button type="button" onClick={() => setPickStore(true)} style={{ width: "100%", textAlign: "left", padding: 12, marginBottom: 14, border: `1px solid ${HAIR}`, background: "#0f0f10", color: "#fff", cursor: "pointer" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE }}>Store</div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{loc ? loc.name : "Choose…"} ›</div>
        </button>
        {loc && names.length === 0 && <div style={{ color: MUTE, fontSize: 14, marginBottom: 10 }}>No tanks saved for this store. Add one below.</div>}
        {names.map((n) => {
          const e = entry(n);
          const pid = productOf(n);
          return (
            <div key={n} style={{ border: `1px solid ${HAIR}`, padding: 12, marginBottom: 8, background: "#0f0f10" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, fontWeight: 800 }}>
                <span>Tank {n}</span><span style={{ color: MUTE, fontWeight: 600 }}>{pid ? productName(pid) : ""}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 6 }}>
                <input style={inp} inputMode="decimal" placeholder={e.unit === "inches" ? "Inches" : "Gallons"} value={e.value} onChange={(ev) => put(n, { value: ev.target.value })} />
                <div style={{ display: "flex" }}>
                  {(["gallons", "inches"] as Unit[]).map((u) => (
                    <button key={u} type="button" onClick={() => put(n, { unit: u })} style={{ padding: "0 12px", fontSize: 12, fontWeight: 800, border: `1px solid ${e.unit === u ? "#fff" : HAIR}`, background: e.unit === u ? "#fff" : "transparent", color: e.unit === u ? "#000" : "#fff", cursor: "pointer" }}>{u === "gallons" ? "Gal" : "In"}</button>
                  ))}
                </div>
              </div>
              <input style={{ ...inp, fontSize: 14 }} inputMode="decimal" placeholder="Water, inches (if any)" value={e.water} onChange={(ev) => put(n, { water: ev.target.value })} />
            </div>
          );
        })}
        {loc && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 14 }}>
            <input style={inp} placeholder="+ Another tank number" value={newTank} onChange={(ev) => setNewTank(ev.target.value)} />
            <button type="button" onClick={addTank} style={{ padding: "0 14px", fontSize: 12, fontWeight: 800, border: `1px solid ${HAIR}`, background: "transparent", color: "#fff", cursor: "pointer" }}>ADD</button>
          </div>
        )}
        <button type="button" onClick={() => setPhotoOpen(true)} style={{ width: "100%", padding: 12, marginBottom: 10, border: `1px solid ${HAIR}`, background: "transparent", color: paths.length ? "#4ade80" : "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
          {paths.length ? `Ticket: ${paths.length} photo${paths.length === 1 ? "" : "s"} ✓` : "Add a ticket photo (optional)"}
        </button>
        <input style={{ ...inp, fontSize: 14, marginBottom: 10 }} placeholder="Note (optional)" value={note} onChange={(ev) => setNote(ev.target.value)} />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <button type="button" onClick={save} style={{ width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>Save tank check</button>
      </FullscreenModal>

      <CaptureSheet open={open && photoOpen} purpose="tank_ticket" title="Meter ticket" companyId={companyId} userId={userId} refType="tank_check"
        onDone={(r) => { setPaths(r.paths); setPhotoOpen(false); }} onClose={() => setPhotoOpen(false)} />

      <LocationPicker kinds={["store"]} open={open && pickStore} title="Which store?" origin={origin} locations={locations} tanks={tanks} companyId={companyId} userId={userId}
        selectedLocationId={loc?.location_id ?? null} onLocationAdded={onLocationAdded}
        onPick={(to) => { const l = locations.find((x) => x.location_id === to.locationId) ?? null; if (l) { setLoc(l); setEntries([]); setExtra([]); } setPickStore(false); }}
        onClose={() => { setPickStore(false); if (!loc) onClose(); }} />
    </>
  );
}
