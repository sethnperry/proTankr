"use client";
// app/planner/components/trip/deliveryUi.tsx
//
// The delivery-location screens' building blocks, in the same instrument look as the Terminal screen: flat
// near-black panels, hairline rules, small-caps labels, square corners, white primary actions.

import React from "react";

export const HAIR = "rgba(255,255,255,0.12)";
export const MUTE = "rgba(255,255,255,0.52)";
export const PANEL: React.CSSProperties = { background: "#0f0f10", border: `1px solid ${HAIR}` };
export const CAPS: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE };

export const FIELD: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "#0a0a0b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, padding: "11px 12px", borderRadius: 0, outline: "none", colorScheme: "dark" };
export const FIELD_SM: React.CSSProperties = { ...FIELD, fontSize: 14, padding: "9px 8px" };

/** A section heading with a rule under it. */
export function Label({ children, right, first }: { children: React.ReactNode; right?: React.ReactNode; first?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: first ? "0 0 8px" : "22px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ ...CAPS, flex: 1 }}>{children}</span>{right}
    </div>
  );
}

/** A small caption above a field. */
export function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={style}><div style={{ ...CAPS, marginBottom: 5 }}>{label}</div>{children}</div>;
}

/** A square option chip (region, local area). */
export function Chip({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "#fff" : HAIR}`, background: on ? "#fff" : "#0a0a0b", color: on ? "#000" : "rgba(255,255,255,0.8)" }}>{children}</button>
  );
}

/** Two or three squares side by side, one on. */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 1, background: HAIR, border: `1px solid ${HAIR}` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          style={{ padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", border: "none", background: value === o.id ? "#fff" : "#0f0f10", color: value === o.id ? "#000" : "rgba(255,255,255,0.7)" }}>{o.label}</button>
      ))}
    </div>
  );
}

export const primary: React.CSSProperties = { width: "100%", padding: "15px 0", border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" };
export const dark: React.CSSProperties = { width: "100%", padding: "14px 0", border: `1px solid ${HAIR}`, background: "#050505", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" };
