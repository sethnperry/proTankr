"use client";
// app/planner/components/track/ParkedMap.tsx
//
// Fleet map of parked equipment: one pin per spot (a truck and its trailer parked together share a pin).
// Tap a pin or a list row for who parked it and when, and to open it in Google Maps. Units in use have no
// pin (the database removes it the moment anyone takes the unit). Browser only (dynamic import in TrackSheet).

import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { ageText, mapsUrl } from "@/lib/equipment/trackFormat";
import type { MapPin } from "@/lib/equipment/parkedPins";
import { muted } from "../trip/tripUi";

const icon = (label: string, active: boolean) => L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%);white-space:nowrap;padding:3px 7px;font:800 12px system-ui;background:${active ? "#fff" : "#1f2937"};color:${active ? "#000" : "#fff"};border:2px solid ${active ? "#000" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.6)">${label.replace(/</g, "&lt;")}</div>`,
  iconSize: [0, 0],
});

export default function ParkedMap({ open, onClose, pins, nameOf, onOpenUnit }: {
  open: boolean; onClose: () => void; pins: MapPin[];
  nameOf: (userId: string | null) => string | null;
  onOpenUnit: (u: { kind: "truck" | "trailer"; id: string }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const [sel, setSel] = useState<string | null>(null);
  const selPin = useMemo(() => pins.find((p) => p.key === sel) ?? null, [pins, sel]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (!box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: true }).setView([39.5, -98.35], 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      map.current = m;
      draw();
    }, 60);
    return () => { window.clearTimeout(t); map.current?.remove(); map.current = null; markers.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function draw() {
    const m = map.current; if (!m) return;
    markers.current.forEach((x) => x.remove()); markers.current.clear();
    for (const p of pins) {
      const mk = L.marker([p.lat, p.lon], { icon: icon(p.label, p.key === sel) }).addTo(m);
      mk.on("click", () => setSel(p.key));
      markers.current.set(p.key, mk);
    }
    if (pins.length && !sel) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number])), { padding: [40, 40], maxZoom: 15 });
  }
  useEffect(() => { draw(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pins]);
  useEffect(() => {
    markers.current.forEach((mk, key) => { const p = pins.find((x) => x.key === key); if (p) mk.setIcon(icon(p.label, key === sel)); });
    if (selPin && map.current) map.current.setView([selPin.lat, selPin.lon], Math.max(map.current.getZoom(), 15));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  return (
    <FullscreenModal open={open} onClose={onClose} title="Parked equipment" footer={null}>
      <div ref={box} style={{ width: "100%", height: "46vh", minHeight: 260, background: "#111", border: "1px solid rgba(255,255,255,0.14)" }} />
      <div style={{ fontSize: 12, color: muted, margin: "8px 0 10px" }}>
        {pins.length === 0 ? "Nothing is parked with a saved location yet. A pin is saved when a driver ends a shift and parks." : `${pins.length} spot${pins.length === 1 ? "" : "s"} · units in use have no pin.`}
      </div>
      {selPin && (
        <div style={{ border: "1px solid rgba(255,255,255,0.4)", padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{selPin.label}</div>
          <div style={{ fontSize: 13, marginTop: 3 }}>Parked {ageText(selPin.parkedAt)}{nameOf(selPin.parkedBy) ? ` by ${nameOf(selPin.parkedBy)}` : ""}</div>
          {selPin.placeLabel && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>Near {selPin.placeLabel}</div>}
          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            <a href={mapsUrl(selPin.lat, selPin.lon)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 800, color: "#93c5fd", textDecoration: "none" }}>Open in Maps</a>
            {selPin.units.map((u) => (
              <button key={u.id} type="button" onClick={() => onOpenUnit({ kind: u.kind, id: u.id })} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 800, color: "#93c5fd", cursor: "pointer" }}>{u.kind === "truck" ? "Truck" : "Trailer"} {u.name} ›</button>
            ))}
          </div>
        </div>
      )}
      {pins.map((p) => (
        <button key={p.key} type="button" onClick={() => setSel(p.key)}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 6, border: `1px solid ${p.key === sel ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.14)"}`, background: "transparent", color: "#fff", cursor: "pointer" }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{p.label}</span>
          <span style={{ fontSize: 12, color: muted }}> · {p.placeLabel ?? "no saved place nearby"} · {ageText(p.parkedAt)}</span>
        </button>
      ))}
    </FullscreenModal>
  );
}
