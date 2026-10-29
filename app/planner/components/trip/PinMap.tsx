"use client";
// app/planner/components/trip/PinMap.tsx
//
// Set a delivery location on a map: search for the place (or pan to it), tap the map to drop the pin
// (drag to adjust), then "Use this pin". The pin gives exact coordinates, the street address, city,
// state, zip and county, so it works for someone who isn't standing at the site. Loaded only in the
// browser (see LocationEditor's dynamic import).

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { fieldInput, linkBtn, muted, primaryBtn } from "./tripUi";

export type PinResult = { lat: number; lon: number; address: string | null; city: string | null; state: string | null; zip: string | null; county: string | null };

async function api<T>(qs: string): Promise<T | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`/api/geocode?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function PinMap({ open, start, startQuery, onUse, onClose }: {
  open: boolean;
  start: { lat: number; lon: number } | null;
  startQuery: string;
  onUse: (r: PinResult) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(start);
  const [q, setQ] = useState(startQuery);
  const [results, setResults] = useState<{ lat: number; lon: number; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const place = (lat: number, lon: number, zoom?: number) => {
    const m = map.current; if (!m) return;
    setPin({ lat, lon });
    if (!marker.current) {
      marker.current = L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({ className: "", html: '<div style="width:22px;height:22px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.5)"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
      }).addTo(m);
      marker.current.on("dragend", () => { const p = marker.current!.getLatLng(); setPin({ lat: p.lat, lon: p.lng }); });
    } else marker.current.setLatLng([lat, lon]);
    if (zoom) m.setView([lat, lon], zoom);
  };

  // Build the map each time the window opens (the container only exists while it is open).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (!box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: true }).setView(start ? [start.lat, start.lon] : [39.5, -98.35], start ? 17 : 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      m.on("click", (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng));
      map.current = m;
      if (start) place(start.lat, start.lon);
      else if (startQuery.trim()) void search(startQuery);
    }, 60);
    return () => {
      window.clearTimeout(t);
      map.current?.remove(); map.current = null; marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const search = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    const r = await api<{ results: { lat: number; lon: number; label: string }[] }>(`search=${encodeURIComponent(text.trim())}`);
    setBusy(false);
    const list = r?.results ?? [];
    setResults(list);
    if (!list.length) return setErr("Nothing found. Try a street address, or pan the map and tap to drop the pin.");
    map.current?.setView([list[0].lat, list[0].lon], 17);
  };

  const use = async () => {
    if (!pin) return;
    setBusy(true); setErr(null);
    const r = await api<Omit<PinResult, "lat" | "lon">>(`pin=1&lat=${pin.lat}&lon=${pin.lon}`);
    setBusy(false);
    onUse({ lat: pin.lat, lon: pin.lon, address: r?.address ?? null, city: r?.city ?? null, state: r?.state ?? null, zip: r?.zip ?? null, county: r?.county ?? null });
    onClose();
  };

  return (
    <FullscreenModal open={open} title="Set on map" onClose={onClose} footer={null}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(q); }}
          placeholder="Search a street address or place" style={{ ...fieldInput, flex: 1, marginBottom: 0 }} />
        <button type="button" onClick={() => void search(q)} disabled={busy} style={{ ...linkBtn, fontWeight: 700 }}>Search</button>
      </div>
      {results.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
          {results.map((r, i) => (
            <button key={i} type="button" onClick={() => map.current?.setView([r.lat, r.lon], 17)}
              style={{ textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", fontSize: 12, padding: "7px 2px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <div ref={box} style={{ height: "52dvh", minHeight: 280, borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "#161616" }} />
      <div style={{ fontSize: 12, color: muted, margin: "8px 0" }}>
        {pin ? "Drag the pin or tap the map to move it right onto the site." : "Search, then tap the map to drop the pin on the site."}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
      <button type="button" onClick={() => void use()} disabled={!pin || busy} aria-busy={busy} style={{ ...primaryBtn, opacity: !pin || busy ? 0.5 : 1 }}>
        Use this pin
      </button>
    </FullscreenModal>
  );
}
