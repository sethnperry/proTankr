"use client";
// app/planner/components/track/UnitStoryMap.tsx
//
// One unit, up to two pins: where it was put down (the status location) and where Geotab has it now. Same spot
// shows as one pin. Browser only (dynamic import in TrackDetail).

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { mapsUrl } from "@/lib/equipment/trackFormat";
import { muted } from "../trip/tripUi";

export type StoryPin = { key: string; lat: number; lon: number; label: string; sub: string; color: string };

const icon = (label: string, color: string) => L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%);white-space:nowrap;padding:3px 7px;font:800 12px system-ui;background:#111;color:#fff;border:2px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.6)">${label.replace(/</g, "&lt;")}</div>`,
  iconSize: [0, 0],
});

export default function UnitStoryMap({ open, onClose, title, pins }: { open: boolean; onClose: () => void; title: string; pins: StoryPin[] }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (!box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: true }).setView([pins[0]?.lat ?? 39.5, pins[0]?.lon ?? -98.35], 14);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      for (const p of pins) L.marker([p.lat, p.lon], { icon: icon(p.label, p.color) }).addTo(m);
      if (pins.length > 1) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number])), { padding: [50, 50], maxZoom: 15 });
      map.current = m;
    }, 60);
    return () => { window.clearTimeout(t); map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <FullscreenModal open={open} onClose={onClose} title={title} footer={null}>
      <div ref={box} style={{ width: "100%", height: "46vh", minHeight: 260, background: "#111", border: "1px solid rgba(255,255,255,0.14)" }} />
      {pins.map((p) => (
        <div key={p.key} style={{ border: `1px solid ${p.color}`, padding: "10px 12px", marginTop: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{p.label}</div>
          <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{p.sub}</div>
          <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</div>
          <a href={mapsUrl(p.lat, p.lon)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 13, fontWeight: 800, color: "#93c5fd", textDecoration: "none" }}>Open in Maps</a>
        </div>
      ))}
    </FullscreenModal>
  );
}
