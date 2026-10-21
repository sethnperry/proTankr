"use client";
// app/planner/components/FindTruckSheet.tsx
//
// "Where's my truck?": pick a truck (the one you hold, if any), fetch its last
// position from the company's telematics connection, and open it in the phone's
// maps app. Only trucks linked to a Geotab vehicle can be located.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { fetchTruckReading, type TruckReading } from "@/lib/telematics/useTruckReading";
import { fieldInput, muted } from "./trip/tripUi";

type TruckOpt = { id: string; name: string };

export function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

export function ageText(iso: string | null, nowMs: number = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "time unknown";
  const min = Math.max(0, Math.round((nowMs - t) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60} min ago` : `${Math.floor(h / 24)} d ago`;
}

export function FindTruckSheet({ open, onClose, companyId, defaultTruckId }: {
  open: boolean; onClose: () => void; companyId: string | null; defaultTruckId: string | null;
}) {
  const [trucks, setTrucks] = useState<TruckOpt[]>([]);
  const [truckId, setTruckId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [reading, setReading] = useState<TruckReading | null>(null);

  const locate = useCallback(async (id: string) => {
    setBusy(true); setDone(false);
    const r = await fetchTruckReading(id);
    setReading(r); setBusy(false); setDone(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(""); setReading(null); setDone(false);
    setTruckId(defaultTruckId);
    if (defaultTruckId) void locate(defaultTruckId);
    if (!companyId) return;
    let off = false;
    void supabase.from("trucks").select("truck_id, truck_name, active").eq("company_id", companyId).order("truck_name")
      .then(({ data }) => { if (!off) setTrucks(((data ?? []) as any[]).filter((t) => t.active !== false).map((t) => ({ id: t.truck_id, name: t.truck_name ?? "Truck" }))); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? trucks.filter((x) => x.name.toLowerCase().includes(t)) : trucks).slice(0, 60);
  }, [trucks, q]);
  const name = trucks.find((t) => t.id === truckId)?.name ?? null;
  const hasPos = reading?.lat != null && reading?.lon != null;
  const place = [reading?.city, reading?.state].filter(Boolean).join(", ");

  return (
    <FullscreenModal open={open} onClose={onClose} title="Find a truck" footer={null}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search truck number" style={{ ...fieldInput, marginBottom: 10 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {shown.map((t) => {
          const on = t.id === truckId;
          return (
            <button key={t.id} type="button" onClick={() => { setTruckId(t.id); void locate(t.id); }}
              style={{ padding: "8px 12px", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer", color: "#fff",
                border: on ? "2px solid #fff" : "1px solid rgba(255,255,255,0.18)", background: on ? "rgba(255,255,255,0.1)" : "transparent" }}>{t.name}</button>
          );
        })}
        {shown.length === 0 && <div style={{ fontSize: 13, color: muted }}>No trucks found.</div>}
      </div>

      {truckId && (
        <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: muted }}>Truck {name ?? ""}</span>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => void locate(truckId)} disabled={busy} aria-busy={busy}
              style={{ border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", padding: "6px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {busy ? "Fetching…" : "Refresh"}
            </button>
          </div>
          {busy && !reading && <div style={{ fontSize: 14, color: muted, marginTop: 12 }}>Asking Geotab for the last position…</div>}
          {done && !reading && (
            <div style={{ fontSize: 14, color: "#fb923c", marginTop: 12 }}>
              Can't locate this truck. It isn't linked to a Geotab vehicle, or Geotab didn't answer. Link it in Company Dashboard → Telematics.
            </div>
          )}
          {reading && !hasPos && <div style={{ fontSize: 14, color: "#fb923c", marginTop: 12 }}>Geotab has no position for this truck yet.</div>}
          {reading && hasPos && (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>{place || "Position found"}</div>
              <div style={{ fontSize: 14, marginTop: 4, color: "rgba(255,255,255,0.75)" }}>
                Last update {ageText(reading.at)}
                {reading.speedMph != null ? ` · ${reading.speedMph > 2 ? `moving ${reading.speedMph} mph` : "stopped"}` : ""}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: muted }}>{reading.lat!.toFixed(5)}, {reading.lon!.toFixed(5)}</div>
              <a href={mapsUrl(reading.lat!, reading.lon!)} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", textAlign: "center", marginTop: 14, padding: "13px 0", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none" }}>
                Open in Maps
              </a>
            </>
          )}
        </div>
      )}
      {!truckId && <div style={{ fontSize: 14, color: muted }}>Pick a truck to see where it was last reported.</div>}
    </FullscreenModal>
  );
}
