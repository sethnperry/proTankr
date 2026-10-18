"use client";
// app/planner/components/PresetActionSheet.tsx
//
// Opened by PresetDial.tsx when a FILLED preset slot is tapped, instead of
// loading (and silently overwriting the working plan) immediately. Three
// actions -- Load, Edit (re-save current plan into this slot), Clear --
// with a confirm step in front of the two destructive ones so nothing
// happens on a stray tap.

import React, { useState } from "react";

type Props = {
  open: boolean;
  letter: string;
  summary: string;
  onLoad: () => void;
  onConfirmEdit: () => void;
  onConfirmClear: () => void;
  onClose: () => void;
};

const rowStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.90)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", textAlign: "left" as const, marginBottom: 8,
};
const dangerRowStyle: React.CSSProperties = { ...rowStyle, color: "#f87171", borderColor: "rgba(248,113,113,0.25)" };
const cancelStyle: React.CSSProperties = {
  width: "100%", padding: "14px 16px", borderRadius: 2, border: "none",
  background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 14, fontWeight: 700, cursor: "pointer",
};

export default function PresetActionSheet({ open, letter, summary, onLoad, onConfirmEdit, onConfirmClear, onClose }: Props) {
  const [mode, setMode] = useState<"menu" | "confirmEdit" | "confirmClear">("menu");

  if (!open) return null;

  const close = () => { setMode("menu"); onClose(); };

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 10300, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, background: "#111518", borderRadius: "2px 2px 0 0", border: "1px solid rgba(255,255,255,0.1)", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))" }}>
        {mode === "menu" && (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 12 }}>
              Preset {letter}
            </div>
            <button type="button" style={rowStyle} onClick={onLoad}>Load {summary}</button>
            <button type="button" style={rowStyle} onClick={() => setMode("confirmEdit")}>Edit Preset</button>
            <button type="button" style={dangerRowStyle} onClick={() => setMode("confirmClear")}>Clear Preset</button>
            <button type="button" style={cancelStyle} onClick={close}>Cancel</button>
          </>
        )}

        {mode === "confirmEdit" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              Save current configuration as Preset {letter}?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              This replaces what's currently saved there ({summary}).
            </div>
            <button type="button" style={{ ...rowStyle, background: "#fff", color: "#000", border: "none", textAlign: "center" }} onClick={() => { setMode("menu"); onConfirmEdit(); }}>Save</button>
            <button type="button" style={cancelStyle} onClick={() => setMode("menu")}>Back</button>
          </>
        )}

        {mode === "confirmClear" && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              Clear Preset {letter}?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
              This can't be undone.
            </div>
            <button type="button" style={dangerRowStyle} onClick={() => { setMode("menu"); onConfirmClear(); }}>Clear</button>
            <button type="button" style={cancelStyle} onClick={() => setMode("menu")}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}
