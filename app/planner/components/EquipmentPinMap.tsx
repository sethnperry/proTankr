"use client";
// app/planner/components/EquipmentPinMap.tsx
//
// Fine-tune where a unit (or a coupled pair) is parked, even when the phone is nowhere near it.
// The pin is the unit's own label ("25184 / 3151"): drag it, tap the map to move it, or pan the map and
// press "Put pin at map center". Tap the pin for make / model. Known places (saved locations, fuel stops
// such as "Love's 495") show on the map; tap one to see it and move the pin there. Find an address with
// street / city / state. Browser only (dynamic import).

import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

export type UnitInfo = { kind: "truck" | "trailer"; name: string; make?: string | null; model?: string | null; year?: number | string | null };
export type PinPick = { lat: number; lon: number; address: string | null; city: string | null; state: string | null; zip: string | null; county: string | null };
type Known = { key: string; name: string; sub: string; lat: number; lon: number; kind: "place" | "fuel" };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

async function api<T>(qs: string): Promise<T | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`/api/geocode?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch { return null; }
}

const input: React.CSSProperties = { padding: "9px 10px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 14, outline: "none", minWidth: 0 };
const btn: React.CSSProperties = { padding: "9px 12px", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };

const pinIcon = (label: string) => L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center"><div style="white-space:nowrap;padding:6px 10px;font:800 14px system-ui;background:#ef4444;color:#fff;border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.7)">${esc(label)}</div><div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:12px solid #fff"></div></div>`,
  iconSize: [0, 0],
});
const knownIcon = (name: string, kind: "place" | "fuel") => L.divIcon({
  className: "",
  html: `<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;white-space:nowrap"><span style="width:10px;height:10px;border-radius:50%;background:${kind === "fuel" ? "#f59e0b" : "#60a5fa"};border:2px solid #fff"></span><span style="font:700 11px system-ui;color:#fff;background:rgba(0,0,0,.65);padding:1px 4px">${esc(name)}</span></div>`,
  iconSize: [0, 0],
});

export default function EquipmentPinMap({ open, start, initialQuery, unitLabel, units, companyId, onUse, onClose }: {
  open: boolean;
  start: { lat: number; lon: number } | null;
  initialQuery: string;
  unitLabel: string;
  units: UnitInfo[];
  companyId: string;
  onUse: (r: PinPick) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pinMk = useRef<L.Marker | null>(null);
  const knownLayer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<{ street: L.TileLayer; sat: L.TileLayer } | null>(null);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(start);
  const [known, setKnown] = useState<Known[]>([]);
  const [card, setCard] = useState<"unit" | Known | null>(null);
  const [sat, setSat] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [st, setSt] = useState("");
  const [results, setResults] = useState<{ lat: number; lon: number; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const knownRef = useRef<Known[]>([]); knownRef.current = known;

  const placePin = (lat: number, lon: number, zoom?: number) => {
    const m = map.current; if (!m) return;
    setPin({ lat, lon });
    if (!pinMk.current) {
      pinMk.current = L.marker([lat, lon], { draggable: true, icon: pinIcon(unitLabel), zIndexOffset: 1000 }).addTo(m);
      pinMk.current.on("dragend", () => { const p = pinMk.current!.getLatLng(); setPin({ lat: p.lat, lon: p.lng }); });
      pinMk.current.on("click", () => setCard("unit"));
    } else pinMk.current.setLatLng([lat, lon]);
    if (zoom) m.setView([lat, lon], zoom);
  };

  // Known places drawn in view (capped so a big fleet's list stays light).
  const drawKnown = () => {
    const m = map.current, layer = knownLayer.current; if (!m || !layer) return;
    layer.clearLayers();
    const b = m.getBounds();
    let n = 0;
    for (const k of knownRef.current) {
      if (n >= 80) break;
      if (!b.contains([k.lat, k.lon])) continue;
      n++;
      L.marker([k.lat, k.lon], { icon: knownIcon(k.name, k.kind) }).on("click", () => setCard(k)).addTo(layer);
    }
  };

  useEffect(() => {
    if (!open) return;
    setErr(null); setCard(null); setResults([]);
    void (async () => {
      const out: Known[] = [];
      try {
        const { data } = await supabase.from("delivery_locations").select("location_id,name,location_number,city,state,lat,lon").eq("company_id", companyId).eq("is_active", true).not("lat", "is", null).limit(1500);
        for (const l of (data ?? []) as any[]) out.push({ key: `p${l.location_id}`, name: `${l.name ?? "Place"}${l.location_number ? ` ${l.location_number}` : ""}`, sub: [l.city, l.state].filter(Boolean).join(", "), lat: Number(l.lat), lon: Number(l.lon), kind: "place" });
      } catch { /* none */ }
      try {
        const { data } = await supabase.from("fuel_purchases").select("store_name,store_number,city,state,lat,lon").eq("company_id", companyId).not("store_name", "is", null).not("lat", "is", null).order("started_at", { ascending: false }).limit(600);
        const seen = new Set<string>();
        for (const f of (data ?? []) as any[]) {
          const name = `${f.store_name}${f.store_number ? ` ${f.store_number}` : ""}`;
          const id = name.toLowerCase();
          if (seen.has(id) || out.some((o) => o.name.toLowerCase() === id)) continue;
          seen.add(id);
          out.push({ key: `f${id}`, name, sub: [f.city, f.state].filter(Boolean).join(", "), lat: Number(f.lat), lon: Number(f.lon), kind: "fuel" });
        }
      } catch { /* none */ }
      setKnown(out);
    })();
    const t = window.setTimeout(() => {
      if (!box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: true }).setView(start ? [start.lat, start.lon] : [39.5, -98.35], start ? 17 : 4);
      tiles.current = {
        street: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
        sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri" }),
      };
      tiles.current.street.addTo(m);
      knownLayer.current = L.layerGroup().addTo(m);
      m.on("click", (e: L.LeafletMouseEvent) => { setCard(null); placePin(e.latlng.lat, e.latlng.lng); });
      m.on("moveend", drawKnown);
      map.current = m;
      if (start) placePin(start.lat, start.lon);
      else if (initialQuery.trim()) void find(initialQuery, true);
      drawKnown();
    }, 60);
    return () => {
      window.clearTimeout(t);
      map.current?.remove(); map.current = null; pinMk.current = null; knownLayer.current = null; tiles.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { drawKnown(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [known]);
  useEffect(() => { pinMk.current?.setIcon(pinIcon(unitLabel)); }, [unitLabel]);
  useEffect(() => {
    const m = map.current, t = tiles.current; if (!m || !t) return;
    if (sat) { m.removeLayer(t.street); t.sat.addTo(m); } else { m.removeLayer(t.sat); t.street.addTo(m); }
  }, [sat]);

  const find = async (text: string, drop = true) => {
    if (!text.trim()) { setErr("Enter a street, city or state."); return; }
    setBusy(true); setErr(null);
    const r = await api<{ results: { lat: number; lon: number; label: string }[] }>(`search=${encodeURIComponent(text.trim())}`);
    setBusy(false);
    const list = r?.results ?? [];
    setResults(list);
    if (!list.length) return setErr("Nothing found. Check the spelling, or pan the map and tap to place the pin.");
    if (drop) placePin(list[0].lat, list[0].lon, 17); else map.current?.setView([list[0].lat, list[0].lon], 17);
  };
  const findAddress = () => void find([street, city, st].map((x) => x.trim()).filter(Boolean).join(", "));

  const use = async () => {
    if (!pin) return;
    setBusy(true);
    const r = await api<Omit<PinPick, "lat" | "lon">>(`pin=1&lat=${pin.lat}&lon=${pin.lon}`);
    setBusy(false);
    onUse({ lat: pin.lat, lon: pin.lon, address: r?.address ?? null, city: r?.city ?? null, state: r?.state ?? null, zip: r?.zip ?? null, county: r?.county ?? null });
    onClose();
  };

  const cardBody = useMemo(() => {
    if (card === "unit") return (
      <div>
        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{unitLabel}</div>
        {units.map((u) => (
          <div key={u.kind + u.name} style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            {u.kind === "truck" ? "Truck" : "Trailer"} {u.name}: {[u.year, u.make, u.model].filter(Boolean).join(" ") || "no make / model on file"}
          </div>
        ))}
        {pin && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}</div>}
      </div>
    );
    if (card) return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{card.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{card.kind === "fuel" ? "Fuel stop" : "Saved place"}{card.sub ? ` · ${card.sub}` : ""}</div>
        </div>
        <button type="button" style={{ ...btn, background: "#fff", color: "#000", border: "none" }} onClick={() => { placePin(card.lat, card.lon, 18); setCard(null); }}>Move pin here</button>
      </div>
    );
    return null;
  }, [card, units, unitLabel, pin]);

  return (
    <FullscreenModal open={open} title="Fine-tune location" onClose={onClose} footer={null}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street" style={input} />
        <div style={{ display: "flex", gap: 6 }}>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ ...input, flex: 1 }} />
          <input value={st} onChange={(e) => setSt(e.target.value.toUpperCase())} placeholder="ST" maxLength={2} style={{ ...input, width: 60 }} />
          <button type="button" onClick={findAddress} disabled={busy} style={{ ...btn, background: "#fff", color: "#000", border: "none" }}>Find</button>
        </div>
      </div>
      {results.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 8 }}>
          {results.map((r, i) => (
            <button key={i} type="button" onClick={() => placePin(r.lat, r.lon, 17)}
              style={{ textAlign: "left", background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)", fontSize: 12, padding: "7px 2px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {r.label}
            </button>
          ))}
        </div>
      )}
      <div ref={box} style={{ height: "46dvh", minHeight: 260, border: "1px solid rgba(255,255,255,0.14)", background: "#161616" }} />
      <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
        <button type="button" style={{ ...btn, flex: 1 }} onClick={() => { const c = map.current?.getCenter(); if (c) placePin(c.lat, c.lng); }}>Put pin at map center</button>
        <button type="button" style={btn} onClick={() => setSat((v) => !v)}>{sat ? "Street" : "Satellite"}</button>
      </div>
      {cardBody && <div style={{ border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", padding: 10, marginBottom: 8 }}>{cardBody}</div>}
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>
        {pin ? "Drag the pin, tap the map, or pan and press Put pin at map center. Tap the pin for make and model." : "Find an address, tap a saved place, or tap the map to drop the pin."}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
      <button type="button" onClick={() => void use()} disabled={!pin || busy} aria-busy={busy}
        style={{ width: "100%", padding: "13px 14px", border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.6, cursor: "pointer", opacity: !pin || busy ? 0.5 : 1 }}>
        Use this pin
      </button>
    </FullscreenModal>
  );
}
