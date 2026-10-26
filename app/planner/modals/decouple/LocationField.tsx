"use client";
// app/planner/modals/decouple/LocationField.tsx
//
// Part of DecoupleModal.tsx.


import { D } from "./helpers";
import { FieldLabel } from "./FieldLabel";

export function LocationField({ value, onChange, onGeoTag, geoLoading, isError }: {
  value: string; onChange: (v: string) => void;
  onGeoTag: () => void; geoLoading: boolean; isError?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <FieldLabel>Location *</FieldLabel>
        <button aria-busy={!!(geoLoading)} type="button" onClick={onGeoTag} disabled={geoLoading} style={{
          fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
          color: geoLoading ? "rgba(255,255,255,0.30)" : "#67e8f9",
          background: "none", border: "none", cursor: geoLoading ? "default" : "pointer", padding: 0,
        }}>
          {geoLoading ? "Getting location…" : "📍 Use my location"}
        </button>
      </div>
      <input type="text" placeholder="e.g. Bay 4, North lot, Shop dock 2"
        value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...D.input, ...(isError ? D.inputErr : {}) }} />
      <div style={{ fontSize: 11, color: isError ? "#f87171" : "rgba(255,255,255,0.28)", marginTop: 4 }}>
        {isError ? "Please enter a location before continuing." : "Be specific — yard name, bay number, or street address."}
      </div>
    </div>
  );
}
