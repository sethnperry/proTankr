"use client";
// app/planner/components/track/CapturedPosition.tsx
//
// Where ProTankr last captured this equipment: the phone's GPS when the driver opened the app or tapped Arrive, or at an
// odometer stamp. It is "last seen", not live, so the age is the first thing said. The only Geotab surface left here is
// a plain link to the live map for people who want it.

import type { UnitPosition } from "@/lib/position/useEquipmentPositions";
import { ageText, mapsUrl } from "@/lib/equipment/trackFormat";

const muted = "rgba(255,255,255,0.5)";
const CAUSE: Record<string, string> = { open: "app opened", wake: "app opened", arrive: "Arrive", cancel: "load cancelled", move_begin: "empty move began", move_end: "empty move ended", shift_end: "end of shift", shift_start: "start of shift", fuel: "fuel stop", park: "parked", hook: "hooked", drop: "dropped" };

export function CapturedPosition({ byUnit, units, geotabHref }: {
  byUnit: Map<string, UnitPosition>;
  units: { kind: "truck" | "trailer"; id: string; name: string }[];
  geotabHref?: string | null;
}) {
  if (!units.length) return null;
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.14)", background: "#121213", padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>Last captured position</div>
      {units.map((u) => {
        const p = byUnit.get(`${u.kind}:${u.id}`);
        return (
          <div key={`${u.kind}:${u.id}`} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{u.kind === "truck" ? "Truck" : "Trailer"} {u.name}</div>
            {p ? (
              <div style={{ fontSize: 14, marginTop: 2 }}>
                <span style={{ color: Date.now() - Date.parse(p.capturedAt) > 6 * 3600_000 ? "#fb923c" : "#fff" }}>{ageText(p.capturedAt)}</span>
                <span style={{ color: muted }}> · {CAUSE[p.cause ?? ""] ?? p.cause ?? "captured"}</span>
                {" · "}<a href={mapsUrl(p.lat, p.lon)} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</a>
                {p.odometer != null && <span style={{ color: muted }}> · odometer {Math.round(p.odometer).toLocaleString("en-US")}</span>}
              </div>
            ) : <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>No capture yet. A position is saved when its driver opens the app, taps Arrive or confirms an odometer.</div>}
          </div>
        );
      })}
      {geotabHref && <a href={geotabHref} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>Track in Geotab ›</a>}
    </div>
  );
}
