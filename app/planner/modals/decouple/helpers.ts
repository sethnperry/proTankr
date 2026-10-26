"use client";
// app/planner/modals/decouple/helpers.ts
//
// Part of DecoupleModal.tsx.

import React, { useState, useCallback, useRef, useEffect } from "react";

import type { TruckStatus, TrailerStatus } from "./types";

export const TRUCK_STATUSES: { code: TruckStatus; label: string; sub: string; warn?: boolean }[] = [
  { code: "in_use",    label: "In Use",    sub: "Actively in service (coupled, bobtailing, or otherwise deployed)" },
  { code: "readyline", label: "Readyline", sub: "Ready to couple and run" },
  { code: "deadline",  label: "Deadline",  sub: "Down for repairs or inspection — do not couple", warn: true },
];

export const TRAILER_STATUSES: { code: TrailerStatus; label: string; sub: string; warn?: boolean }[] = [
  { code: "in_use",    label: "In Use",    sub: "Actively in service (coupled, loaded, or otherwise deployed)" },
  { code: "readyline", label: "Readyline", sub: "Ready to couple and load" },
  { code: "deadline",  label: "Deadline",  sub: "Down for repairs, inspection, or cleaning — do not couple", warn: true },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

export const D = {
  label: {
    fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
    color: "rgba(255,255,255,0.45)", textTransform: "uppercase",
    marginBottom: 6, display: "block",
  } as React.CSSProperties,
  input: {
    width: "100%", borderRadius: 2, padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.92)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
  } as React.CSSProperties,
  inputErr: {
    border: "1px solid rgba(248,113,113,0.55)",
    backgroundColor: "rgba(180,30,30,0.15)",
  } as React.CSSProperties,
  select: {
    width: "100%", borderRadius: 2, padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.40)", color: "rgba(255,255,255,0.92)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 14px center",
    paddingRight: 36,
  } as React.CSSProperties,
  textarea: {
    width: "100%", borderRadius: 2, padding: "12px 14px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.92)",
    fontSize: 14, outline: "none", boxSizing: "border-box",
    resize: "vertical", minHeight: 72,
  } as React.CSSProperties,
  btn: {
    borderRadius: 2, padding: "10px 16px", fontWeight: 900,
    fontSize: 13, letterSpacing: 0.5, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.09)",
    color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap",
  } as React.CSSProperties,
  btnPrimary: {
    background: "rgba(255,255,255,0.13)",
    border: "1px solid rgba(255,255,255,0.22)",
  } as React.CSSProperties,
  btnDestructive: {
    background: "rgba(180,50,20,0.22)",
    border: "1px solid rgba(220,80,40,0.40)",
    color: "rgba(255,180,140,0.95)",
  } as React.CSSProperties,
  err: {
    borderRadius: 2, padding: "10px 14px",
    background: "rgba(180,40,40,0.18)",
    border: "1px solid rgba(180,40,40,0.32)",
    color: "rgba(255,255,255,0.88)", fontSize: 13, marginBottom: 12,
  } as React.CSSProperties,
  divider: { height: 1, background: "rgba(255,255,255,0.08)", margin: "16px 0 20px" },
  sectionTitle: {
    fontSize: 11, fontWeight: 800, letterSpacing: 0.8,
    color: "rgba(255,255,255,0.35)", textTransform: "uppercase",
    marginBottom: 6,
  } as React.CSSProperties,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

export function useGeoTag(onResult: (location: string, lat: number, lon: number) => void) {
  const [geoLoading, setGeoLoading] = useState(false);
  // Keep a ref to the latest onResult so the trigger callback is always stable
  const onResultRef = useRef(onResult);
  useEffect(() => { onResultRef.current = onResult; });

  const trigger = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "Accept-Language": "en" } });
          const data = await res.json();
          const addr = data?.address ?? {};
          const parts = [
            addr.house_number && addr.road ? `${addr.house_number} ${addr.road}` : addr.road,
            addr.city || addr.town || addr.village || addr.county,
            addr.state,
          ].filter(Boolean);
          const shortAddr = parts.length >= 2 ? parts.join(", ") : data?.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
          onResultRef.current(shortAddr, lat, lon);
        } catch { onResultRef.current(`${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon); }
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, []); // stable — never recreated
  return { geoLoading, trigger };
}
