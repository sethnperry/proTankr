"use client";
// lib/ui/CustomSelect.tsx
//
// Native <select> only lets CSS style the closed control -- the open option
// list is rendered natively by the OS/browser and stays gray-background/
// blue-highlight regardless of appearance/color-scheme CSS on the select
// itself (confirmed live: color-scheme: dark is set globally in
// globals.css, and the popup still rendered light). Full control over the
// open list's colors requires not using a native <select> popup at all.
//
// Shared (not defined inline in a modal file) so any modal needing a select
// gets the fix -- duplicating this per-file is how the native-popup bug
// crept back in once already.

import React, { useEffect, useRef, useState } from "react";

export const selectStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 15, boxSizing: "border-box",
  appearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(255,255,255,0.4)' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 14px center",
  paddingRight: 36,
};

export function CustomSelect({
  value, onChange, options, disabled, buttonStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  buttonStyle?: React.CSSProperties;
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

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          ...selectStyle,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          textAlign: "left" as const, cursor: disabled ? "not-allowed" : "pointer",
          ...buttonStyle,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{selected?.label ?? ""}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 2,
          maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: 4,
        }}>
          {options.map((o) => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              onMouseEnter={() => setHoverValue(o.value)}
              onMouseLeave={() => setHoverValue((v) => (v === o.value ? null : v))}
              style={{
                padding: "10px 12px", fontSize: 15, color: "#fff", cursor: "pointer", borderRadius: 2,
                background: hoverValue === o.value ? "rgba(255,255,255,0.10)" : o.value === value ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
