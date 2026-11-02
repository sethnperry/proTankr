"use client";
// app/planner/components/dash/DashChrome.tsx
//
// Pieces every dashboard shares: the mode switch (any number of modes) and the region filter.
// Lifted out of the Dispatch Dashboard so the Driver, Dispatch and Company dashboards look and
// behave the same. Presentational only.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";

/** Every control in a dashboard header's right column is exactly this wide, so Dispatch and Driver match. */
export const HEADER_CTRL_W = 150;

export function ModeSwitch<M extends string>({ mode, modes, onMode }: {
  mode: M;
  modes: { id: M; label: string }[];
  onMode: (m: M) => void;
}) {
  const L = useDashLook();
  return (
    <div role="group" aria-label="Dashboard mode" style={{ display: "inline-flex", padding: 2, border: `1px solid ${L.hairline}`, background: "#0f0f10", flexShrink: 0, width: HEADER_CTRL_W, boxSizing: "border-box" }}>
      {modes.map((m) => {
        const on = mode === m.id;
        return (
          <button key={m.id} type="button" onClick={() => onMode(m.id)} className="dash-press" aria-pressed={on}
            style={{ flex: 1, border: "none", cursor: "pointer", padding: "7px 0", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
              background: on ? "#fff" : "transparent", color: on ? "#000" : L.muted, borderRadius: 1 }}>
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export type RegionFilter = {
  options: string[];            // every region seen (drivers and units)
  selected: Set<string>;        // empty = all regions
  onChange: (next: Set<string>) => void;
};

export function RegionButton({ r }: { r: RegionFilter }) {

  const L = useDashLook();
  const [open, setOpen] = useState(false);
  const n = r.selected.size;
  const label = n === 0 ? "All regions" : n === 1 ? [...r.selected][0] : `${n} regions`;
  const toggle = (name: string) => {
    const next = new Set(r.selected);
    if (next.has(name)) next.delete(name); else next.add(name);
    r.onChange(next);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="dash-press" aria-label="Choose regions"
        style={{ border: `1px solid ${n ? "#fff" : L.hairline}`, background: "#0f0f10", color: n ? "#fff" : L.muted, cursor: "pointer", padding: "8px 10px", fontSize: 11, fontWeight: 800,
          letterSpacing: "0.12em", textTransform: "uppercase", width: HEADER_CTRL_W, boxSizing: "border-box", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }}>
        {label} ▾
      </button>
      <FullscreenModal open={open} title="Region" onClose={() => setOpen(false)}>
        <div style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>
          Show only drivers, equipment and loads in the regions you pick. None picked shows everything.
        </div>
        <button type="button" onClick={() => r.onChange(new Set())} className="dash-press"
          style={{ ...L.secondary, display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 8, color: "#fff", cursor: "pointer", textAlign: "left", fontWeight: 800, fontSize: 14 }}>
          <span aria-hidden style={{ width: 16, height: 16, border: `1px solid ${L.muted}`, background: n === 0 ? "#fff" : "transparent", flexShrink: 0 }} />
          All regions
        </button>
        {r.options.map((name) => {
          const on = r.selected.has(name);
          return (
            <button key={name} type="button" onClick={() => toggle(name)} className="dash-press" aria-pressed={on}
              style={{ ...L.secondary, display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 8, color: "#fff", cursor: "pointer", textAlign: "left", fontSize: 14 }}>
              <span aria-hidden style={{ width: 16, height: 16, border: `1px solid ${L.muted}`, background: on ? "#fff" : "transparent", flexShrink: 0 }} />
              {name}
            </button>
          );
        })}
      </FullscreenModal>
    </>
  );
}

