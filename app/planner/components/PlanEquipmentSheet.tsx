"use client";
// app/planner/components/PlanEquipmentSheet.tsx
//
// Pick the truck and trailer a load is planned for (the Add load window). It starts on the equipment in use; the driver
// (or dispatch) can plan it on a different truck or trailer, or on a truck with no trailer. A truck with no trailer is a
// bobtail. Reads the company's active trucks and trailers; saves nothing itself.

import { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { RADIUS } from "@/lib/ui/look";

type Unit = { id: string; name: string };
const muted = "rgba(255,255,255,0.5)";

export function PlanEquipmentSheet({ open, companyId, truckId, trailerId, onPick, onClose }: {
  open: boolean; companyId: string | null; truckId: string | null; trailerId: string | null;
  onPick: (v: { truckId: string | null; trailerId: string | null; label: string }) => void; onClose: () => void;
}) {
  const [trucks, setTrucks] = useState<Unit[]>([]);
  const [trailers, setTrailers] = useState<Unit[]>([]);
  const [t, setT] = useState<string | null>(truckId);
  const [r, setR] = useState<string | null>(trailerId);
  const [pairs, setPairs] = useState<{ truckId: string; trailerId: string }[]>([]);
  const [separate, setSeparate] = useState(false);
  useEffect(() => { if (open) { setT(truckId); setR(trailerId); setSeparate(false); } }, [open, truckId, trailerId]);
  useEffect(() => {
    if (!open || !companyId) return;
    let live = true;
    void (async () => {
      const [a, b, c] = await Promise.all([
        supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", companyId).order("truck_name"),
        supabase.from("trailers").select("trailer_id, trailer_name, active").eq("company_id", companyId).order("trailer_name"),
        supabase.from("equipment_combos").select("truck_id, trailer_id").eq("company_id", companyId).eq("active", true),
      ]);
      if (!live) return;
      setPairs(((c.data ?? []) as { truck_id: string | null; trailer_id: string | null }[]).filter((x) => x.truck_id && x.trailer_id).map((x) => ({ truckId: x.truck_id as string, trailerId: x.trailer_id as string })));
      setTrucks(((a.data ?? []) as { truck_id: string; truck_name: string; active: boolean | null }[]).filter((x) => x.active !== false).map((x) => ({ id: x.truck_id, name: x.truck_name })));
      setTrailers(((b.data ?? []) as { trailer_id: string; trailer_name: string; active: boolean | null }[]).filter((x) => x.active !== false).map((x) => ({ id: x.trailer_id, name: x.trailer_name })));
    })();
    return () => { live = false; };
  }, [open, companyId]);
  const row = (on: boolean): React.CSSProperties => ({ display: "block", width: "100%", textAlign: "left", padding: "13px 14px", marginBottom: 6, borderRadius: RADIUS, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.14)"}`, background: on ? "rgba(255,255,255,0.1)" : "#0f0f10", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" });
  const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, margin: "14px 0 8px" };
  return (
    <FullscreenModal open={open} title="Equipment for this load" onClose={onClose} footer={
      <button type="button" className="dash-press" onClick={() => { const tn = trucks.find((x) => x.id === t)?.name, rn = trailers.find((x) => x.id === r)?.name; onPick({ truckId: t, trailerId: t ? r : null, label: [tn ? `Truck ${tn}` : "No truck", t ? (rn ? `Trailer ${rn}` : "Bobtail") : null].filter(Boolean).join(" · ") }); onClose(); }}
        style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", borderRadius: RADIUS }}>Done</button>}>
      <div style={{ fontSize: 13, color: muted }}>Plan this load for any coupled pair; it does not change what you are using now. A truck with no trailer is a bobtail.</div>
      <div style={cap}>Coupled pairs</div>
      {pairs.length === 0 && <div style={{ fontSize: 13, color: muted, marginBottom: 6 }}>No coupled pairs yet.</div>}
      {[...pairs].sort((x, y) => (y.truckId === truckId ? 1 : 0) - (x.truckId === truckId ? 1 : 0)).map((x) => {
        const tn = trucks.find((u) => u.id === x.truckId)?.name, rn = trailers.find((u) => u.id === x.trailerId)?.name;
        if (!tn || !rn) return null;
        return (
          <button key={`${x.truckId}:${x.trailerId}`} type="button" style={row(t === x.truckId && r === x.trailerId)}
            onClick={() => { onPick({ truckId: x.truckId, trailerId: x.trailerId, label: `Truck ${tn} · Trailer ${rn}` }); onClose(); }}>
            {tn} / {rn}{x.truckId === truckId && x.trailerId === trailerId ? <span style={{ color: muted, fontWeight: 600, fontSize: 13 }}>  · current</span> : null}
          </button>
        );
      })}
      <button type="button" style={{ ...row(false), marginTop: 10, color: muted, fontSize: 14 }} onClick={() => setSeparate((v) => !v)}>{separate ? "▾" : "›"} Pick truck and trailer separately</button>
      {separate && (
        <>
          <div style={cap}>Truck</div>
          {trucks.map((x) => <button key={x.id} type="button" style={row(t === x.id)} onClick={() => setT(x.id)}>{x.name}</button>)}
          <div style={cap}>Trailer</div>
          <button type="button" style={row(r == null)} onClick={() => setR(null)}>No trailer (bobtail)</button>
          {trailers.map((x) => <button key={x.id} type="button" style={row(r === x.id)} onClick={() => setR(x.id)}>{x.name}</button>)}
        </>
      )}
    </FullscreenModal>
  );
}
