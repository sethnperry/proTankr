"use client";
// app/planner/dispatch/PlanMoveSheet.tsx
//
// Dispatch a move: a bobtail move, an empty move, a trailer hook or a trailer drop, for a driver, lined up in the order it
// should run. The equipment starts on what the driver holds now and can be changed. Saved as a planned move
// (lib/moves/dispatchedMoves.ts) that shows on the driver's dashboard. Add several in a row to build the sequence.

import { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { DateTimePopout, formatDateTime } from "@/lib/ui/DateTimePopout";
import { LocationPicker } from "../components/trip/LocationPicker";
import { PlanEquipmentSheet } from "../components/PlanEquipmentSheet";
import { locationTitle, type DeliveryLocation, type LocationTank } from "@/lib/trips/deliveryLocations";
import { STEP_KINDS, newDispatchedMove, stepLabel, type StepKind } from "@/lib/moves/dispatchedMoves";
import { RADIUS } from "@/lib/ui/look";

const muted = "rgba(255,255,255,0.5)", hair = "rgba(255,255,255,0.14)";
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, margin: "16px 0 8px" };
const chip = (on: boolean): React.CSSProperties => ({ padding: "11px 14px", fontSize: 14, fontWeight: 800, border: `1px solid ${on ? "#fff" : hair}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff", cursor: "pointer", borderRadius: RADIUS });
const field: React.CSSProperties = { width: "100%", textAlign: "left", padding: "13px 14px", fontSize: 15, fontWeight: 700, background: "#0f0f10", color: "#fff", border: `1px solid ${hair}`, borderRadius: RADIUS, cursor: "pointer", marginBottom: 6 };

export function PlanMoveSheet({ open, onClose, companyId, dispatcherId, drivers, initialDriverId, heldFor, truckName, trailerName, locations, tanks, onLocationAdded }: {
  open: boolean; onClose: () => void; companyId: string | null; dispatcherId: string | null;
  drivers: { id: string; name: string }[]; initialDriverId: string | null;
  heldFor: (driverId: string) => { truckId: string | null; trailerId: string | null } | null;
  truckName: (id: string | null) => string | null; trailerName: (id: string | null) => string | null;
  locations: DeliveryLocation[]; tanks: LocationTank[]; onLocationAdded: () => void;
}) {
  const [driver, setDriver] = useState<string | null>(initialDriverId);
  const [kind, setKind] = useState<StepKind>("bobtail");
  const [equip, setEquip] = useState<{ truckId: string | null; trailerId: string | null; label: string } | null>(null);
  const [equipOpen, setEquipOpen] = useState(false);
  const [place, setPlace] = useState<{ id: string | null; text: string | null }>({ id: null, text: null });
  const [pickOpen, setPickOpen] = useState(false);
  const [when, setWhen] = useState<number | null>(null);
  const [whenOpen, setWhenOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => { if (open) { setDriver(initialDriverId); setKind("bobtail"); setEquip(null); setPlace({ id: null, text: null }); setWhen(null); setNote(""); setErr(null); setAdded([]); } }, [open, initialDriverId]);
  useEffect(() => { setEquip(null); }, [driver]);

  const held = driver ? heldFor(driver) : null;
  const truckId = equip ? equip.truckId : held?.truckId ?? null;
  const trailerId = equip ? equip.trailerId : held?.trailerId ?? null;
  const placeName = place.id ? locationTitle(locations.find((l) => l.location_id === place.id) ?? ({ name: "Saved place" } as DeliveryLocation)) : place.text;
  const needsTrailer = kind === "hook";
  const problem = !driver ? "Pick a driver." : !placeName ? "Pick the place." : !truckId ? "Pick a truck." : needsTrailer && !trailerId ? "Pick the trailer to hook." : null;

  const save = async () => {
    if (problem || !companyId || !dispatcherId || !driver) return setErr(problem);
    setBusy(true); setErr(null);
    try {
      const { data: mine } = await supabase.from("empty_moves").select("dispatch_seq").eq("driver_id", driver).eq("dispatched", true).is("ended_at", null);
      const seq = Math.max(0, ...((mine ?? []) as { dispatch_seq: number | null }[]).map((r) => r.dispatch_seq ?? 0)) + 1;
      const row = newDispatchedMove({
        id: crypto.randomUUID(), companyId, driverId: driver, dispatcherId, kind, seq, nowIso: new Date().toISOString(),
        truckId, trailerId: kind === "bobtail" ? null : trailerId, from: { id: null, text: null }, to: place,
        plannedStartIso: when ? new Date(when).toISOString() : null, note,
      });
      const { error } = await supabase.from("empty_moves").insert(row);
      if (error) throw new Error(error.message.includes("dispatched") ? "Dispatched moves need the latest database update (migration 20261119000000) first." : error.message);
      setAdded((a) => [...a, `${stepLabel(kind)} · ${placeName}`]);
      setPlace({ id: null, text: null }); setNote(""); setWhen(null);
    } catch (e) { setErr((e as Error).message || "Couldn't save."); } finally { setBusy(false); }
  };

  const equipLabel = equip?.label ?? (truckId ? `Truck ${truckName(truckId) ?? "—"} · ${trailerId ? `Trailer ${trailerName(trailerId) ?? "—"}` : "Bobtail"}` : "None held");
  return (
    <FullscreenModal open={open} title="Dispatch a move" onClose={onClose} footer={
      <button type="button" className="dash-press" disabled={busy} onClick={() => void save()}
        style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", borderRadius: RADIUS, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : added.length ? "Add another move" : "Dispatch move"}
      </button>}>
      {added.length > 0 && (
        <div style={{ border: `1px solid ${hair}`, padding: "10px 12px", marginBottom: 6, borderRadius: RADIUS }}>
          <div style={{ ...cap, margin: "0 0 6px" }}>Lined up for {drivers.find((d) => d.id === driver)?.name}</div>
          {added.map((a, i) => <div key={i} style={{ fontSize: 14, fontWeight: 700, color: "#4ade80" }}>{i + 1}. {a}</div>)}
        </div>
      )}
      <div style={cap}>Driver</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {drivers.map((d) => <button key={d.id} type="button" style={chip(driver === d.id)} onClick={() => setDriver(d.id)}>{d.name}</button>)}
      </div>
      <div style={cap}>What</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {STEP_KINDS.map((k) => <button key={k.id} type="button" style={chip(kind === k.id)} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>
      <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>{STEP_KINDS.find((k) => k.id === kind)?.hint}</div>
      <div style={cap}>{kind === "hook" || kind === "drop" ? "At" : "To"}</div>
      <button type="button" style={field} onClick={() => setPickOpen(true)}>{placeName || "Pick a place"} ›</button>
      <div style={cap}>Equipment</div>
      <button type="button" style={field} onClick={() => setEquipOpen(true)}>{equipLabel} ›</button>
      <div style={{ fontSize: 12, color: muted }}>Starts on what the driver holds now. {kind === "hook" ? "Pick the trailer to hook." : kind === "drop" ? "The trailer being dropped is the one on the truck." : ""}</div>
      <div style={cap}>When (optional)</div>
      <button type="button" style={field} onClick={() => setWhenOpen(true)}>{when ? formatDateTime(when) : "Whenever it's their turn"} ›</button>
      <div style={cap}>Note for the driver (optional)</div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gate code, which door, anything to know" style={{ ...field, cursor: "text", fontWeight: 500 }} />
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{err}</div>}

      <LocationPicker open={pickOpen} title={kind === "hook" || kind === "drop" ? "Where" : "To where"} locations={locations} tanks={tanks} companyId={companyId} userId={dispatcherId}
        onPick={(to) => { setPlace({ id: to.locationId, text: to.oneOffName }); setPickOpen(false); }} onClose={() => setPickOpen(false)} onLocationAdded={onLocationAdded} />
      <PlanEquipmentSheet open={equipOpen} companyId={companyId} truckId={truckId} trailerId={trailerId} onPick={setEquip} onClose={() => setEquipOpen(false)} />
      <DateTimePopout open={whenOpen} title="When" valueMs={when ?? Date.now()} onSet={(ms) => { setWhen(ms); setWhenOpen(false); }} onCancel={() => setWhenOpen(false)} />
    </FullscreenModal>
  );
}
