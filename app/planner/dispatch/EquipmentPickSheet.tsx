"use client";
// app/planner/dispatch/EquipmentPickSheet.tsx
//
// Pick the truck and trailer a dispatcher is planning a driver onto, when the
// driver is not holding any (the truck is parked on the ready line, or a
// partner has been running it). Each unit shows who has it now, or who had it
// last, so a conflict is visible before it is planned.
import { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";

export type EquipUnit = { id: string; name: string; note: string | null };

export function EquipmentPickSheet(p: {
  open: boolean; driverName: string;
  trucks: EquipUnit[]; trailers: EquipUnit[];
  truckId: string | null; trailerId: string | null;
  onChange: (truckId: string | null, trailerId: string | null) => void;
  onClose: () => void;
}) {
  const L = useDashLook();
  const [tq, setTq] = useState("");
  const [lq, setLq] = useState("");
  const list = (units: EquipUnit[], q: string, sel: string | null, pick: (id: string) => void) => {
    const s = q.trim().toLowerCase();
    return units.filter((u) => !s || u.name.toLowerCase().includes(s) || (u.note ?? "").toLowerCase().includes(s)).slice(0, 30).map((u) => (
      <button key={u.id} type="button" onClick={() => pick(u.id)}
        style={{ display: "flex", justifyContent: "space-between", gap: 10, width: "100%", textAlign: "left", background: u.id === sel ? "rgba(255,255,255,0.12)" : "#121213", border: `1px solid ${u.id === sel ? "#fff" : "rgba(255,255,255,0.14)"}`, color: "#fff", fontSize: 15, fontWeight: 700, padding: "11px 14px", marginBottom: 6, borderRadius: 2, cursor: "pointer" }}>
        <span>{u.name}</span>
        {u.note && <span style={{ fontSize: 12, fontWeight: 400, color: u.note.startsWith("In use") ? "#fbbf24" : L.muted }}>{u.note}</span>}
      </button>
    ));
  };
  const box = { width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "10px 12px", borderRadius: 2, marginBottom: 8 } as const;
  return (
    <FullscreenModal open={p.open} title={`Equipment for ${p.driverName}`} onClose={p.onClose}>
      <div style={{ fontSize: 12, color: L.muted, marginBottom: 10 }}>Planned onto each trip you dispatch. The driver can change it when he begins.</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Truck</div>
      <input value={tq} onChange={(e) => setTq(e.target.value)} placeholder="Search trucks" style={box} />
      {list(p.trucks, tq, p.truckId, (id) => p.onChange(id, p.trailerId))}
      <div style={{ fontSize: 12, fontWeight: 800, color: L.muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" }}>Trailer</div>
      <input value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Search trailers" style={box} />
      {list(p.trailers, lq, p.trailerId, (id) => p.onChange(p.truckId, id))}
    </FullscreenModal>
  );
}
