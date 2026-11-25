"use client";
// app/planner/components/trip/DispatchedBeginSheet.tsx
//
// Beginning a dispatched load only needs a few things confirmed: the beginning miles, where the truck is starting from,
// and, when it differs from what dispatch planned, the equipment. Everything else (order, shipper, customer, pickup,
// delivery, plan) came from dispatch. "More details" opens the full Begin Trip sheet.
import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { RADIUS } from "@/lib/ui/look";
import { matchesTracker } from "@/lib/telematics/odometerSync";
import { TrackerCheck } from "../TrackerCheck";

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "transparent", border: "none", borderBottom: `1px solid ${hair}`, color: "#fff", fontSize: 22, fontWeight: 800, padding: "6px 0", outline: "none" };

export function DispatchedBeginSheet({ open, miles0, city0, state0, liveMiles, suggestStart, plannedTruckId, plannedTrailerId, truckId, trailerId, onChangeEquipment, onMore, onConfirm, onClose }: {
  open: boolean; miles0: string; city0: string; state0: string; liveMiles: number | null;
  suggestStart: () => Promise<{ city: string; state: string | null } | null>;
  plannedTruckId: string | null; plannedTrailerId: string | null; truckId: string | null; trailerId: string | null;
  onChangeEquipment: () => void; onMore: () => void;
  onConfirm: (v: { miles: string; city: string; state: string }) => void; onClose: () => void;
}) {
  const [miles, setMiles] = useState(""); const [city, setCity] = useState(""); const [st, setSt] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    setMiles(miles0 || (liveMiles != null ? String(Math.round(liveMiles)) : "")); setCity(city0); setSt(state0);
    if (!city0) void suggestStart().then((s) => { if (s) { setCity((c) => c || s.city); setSt((x) => x || (s.state ?? "")); } }).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = [plannedTruckId, truckId].filter(Boolean) as string[], rids = [plannedTrailerId, trailerId].filter(Boolean) as string[];
  useEffect(() => {
    if (!open) return;
    let live = true;
    void (async () => {
      const [a, b] = await Promise.all([
        ids.length ? supabase.from("trucks").select("truck_id, truck_name").in("truck_id", ids) : Promise.resolve({ data: [] }),
        rids.length ? supabase.from("trailers").select("trailer_id, trailer_name").in("trailer_id", rids) : Promise.resolve({ data: [] }),
      ]);
      if (!live) return;
      const m: Record<string, string> = {};
      for (const x of (a.data ?? []) as any[]) m[x.truck_id] = x.truck_name;
      for (const x of (b.data ?? []) as any[]) m[x.trailer_id] = x.trailer_name;
      setNames(m);
    })();
    return () => { live = false; };
  }, [open, plannedTruckId, plannedTrailerId, truckId, trailerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (t: string | null, r: string | null) => [t ? `Truck ${names[t] ?? "…"}` : "No truck", t ? (r ? `Trailer ${names[r] ?? "…"}` : "Bobtail") : null].filter(Boolean).join(" · ");
  const differs = !!plannedTruckId && (plannedTruckId !== truckId || (plannedTrailerId ?? null) !== (trailerId ?? null));
  return (
    <FullscreenModal open={open} title="Begin load" onClose={onClose} footer={
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" className="dash-press" onClick={() => onConfirm({ miles, city: city.trim(), state: st.trim().toUpperCase() })}
          style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: RADIUS }}>Begin</button>
        <button type="button" className="dash-press" onClick={onMore}
          style={{ width: "100%", padding: "12px 0", fontSize: 14, fontWeight: 700, background: "transparent", color: muted, border: `1px solid ${hair}`, cursor: "pointer", borderRadius: RADIUS }}>More details ›</button>
      </div>}>
      <div style={{ ...cap, margin: "4px 0 2px" }}>Beginning miles</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input value={miles} onChange={(e) => setMiles(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Odometer" style={{ ...field, flex: 1, minWidth: 0 }} />
        {matchesTracker(miles, liveMiles) && <TrackerCheck size={24} />}
      </div>
      <div style={{ ...cap, margin: "18px 0 2px" }}>Starting from</div>
      <div style={{ display: "flex", gap: 10 }}>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ ...field, flex: 1, minWidth: 0 }} />
        <input value={st} onChange={(e) => setSt(e.target.value.slice(0, 2))} placeholder="ST" autoCapitalize="characters" style={{ ...field, width: 56, flex: "none", textTransform: "uppercase" }} />
      </div>
      {differs && (
        <div style={{ marginTop: 18, padding: "12px 14px", border: "1px solid rgba(251,146,60,0.5)", background: "rgba(251,146,60,0.07)" }}>
          <div style={{ fontSize: 13, color: "#fdba74", fontWeight: 700 }}>Dispatch planned {label(plannedTruckId, plannedTrailerId)}.</div>
          <div style={{ fontSize: 13, color: "#fdba74", marginTop: 2 }}>You're on {label(truckId, trailerId)}.</div>
          <button type="button" className="dash-press" onClick={onChangeEquipment}
            style={{ marginTop: 10, width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 800, background: "transparent", color: "#fff", border: `1px solid ${hair}`, cursor: "pointer", borderRadius: RADIUS }}>Change equipment ›</button>
        </div>
      )}
    </FullscreenModal>
  );
}
