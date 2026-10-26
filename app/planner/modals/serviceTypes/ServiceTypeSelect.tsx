"use client";
// app/planner/modals/serviceTypes/ServiceTypeSelect.tsx
//
// Part of ServiceTypeManager.tsx.

import { useEffect, useRef, useState } from "react";

import type { ServiceType } from "./types";
import { selectStyle } from "./helpers";

export function ServiceTypeSelect({
  value, onChange, types, onEditType, onNewType,
}: {
  value: string;
  onChange: (v: string) => void;
  types: ServiceType[];
  onEditType: (t: ServiceType) => void;
  onNewType: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hoverValue, setHoverValue] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  const selectedLabel = value === "" ? "Select…" : types.find((t) => t.service_type_id === value)?.name ?? "";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...selectStyle, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" as const, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{selectedLabel}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 2,
          maxHeight: 280, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: 4,
        }}>
          <div
            onClick={() => { onChange(""); setOpen(false); }}
            onMouseEnter={() => setHoverValue("")}
            onMouseLeave={() => setHoverValue((v) => (v === "" ? null : v))}
            style={{ padding: "10px 12px", fontSize: 15, color: "#fff", cursor: "pointer", borderRadius: 2, background: hoverValue === "" ? "rgba(255,255,255,0.10)" : "transparent" }}
          >
            Select…
          </div>
          {types.map((t) => (
            <div
              key={t.service_type_id}
              style={{
                display: "flex", alignItems: "center", gap: 6, borderRadius: 2,
                background: hoverValue === t.service_type_id ? "rgba(255,255,255,0.10)" : t.service_type_id === value ? "rgba(255,255,255,0.05)" : "transparent",
              }}
              onMouseEnter={() => setHoverValue(t.service_type_id)}
              onMouseLeave={() => setHoverValue((v) => (v === t.service_type_id ? null : v))}
            >
              <div
                onClick={() => { onChange(t.service_type_id); setOpen(false); }}
                style={{ flex: 1, padding: "10px 12px", fontSize: 15, color: "#fff", cursor: "pointer" }}
              >
                {t.name}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onEditType(t); }}
                title={`Edit "${t.name}"`}
                style={{
                  width: 26, height: 26, marginRight: 6, flexShrink: 0, borderRadius: "50%",
                  border: "1px solid rgba(220,60,60,0.5)", background: "rgba(180,40,40,0.18)",
                  color: "#fca5a5", fontWeight: 900, fontSize: 15, lineHeight: 1, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                −
              </button>
            </div>
          ))}
          <div
            onClick={() => { setOpen(false); onNewType(); }}
            onMouseEnter={() => setHoverValue("__new__")}
            onMouseLeave={() => setHoverValue((v) => (v === "__new__" ? null : v))}
            style={{ padding: "10px 12px", fontSize: 15, color: "rgba(255,255,255,0.65)", cursor: "pointer", borderRadius: 2, background: hoverValue === "__new__" ? "rgba(255,255,255,0.10)" : "transparent" }}
          >
            + New type
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log a service record against a truck and/or trailer ──────────────────

// ─── One unit's own type (+ reading) picker, used standalone or as one of
// two independent sub-sections when servicing both units together ─────────
// 2026-08-29: previously "Both" forced the SAME service_type_id onto both
// units' rows -- per explicit spec ("a user might put wet service for the
// truck and check and inspect for the trailer type"), each unit now picks
// its own type entirely independently.
