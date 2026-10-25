"use client";
// app/planner/components/TempDial.tsx
//
// Round drag dial for setting one temperature for every product. Self-contained:
// no planner state, just value/min/max/step/onChange.

import { useCallback, useRef, useState } from "react";

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));



// TempDial component -- "moon" redesign: a glowing gradient orb with
// scattered decorative tick marks around it (reference image supplied by
// user), same drag-anywhere-in-the-widget sensitivity as the old ring/arc
// version (the hit area is still the full outer box, not just the visible
// orb, so dragging isn't harder to grab). Tapping without dragging opens a
// centered numeric-keypad popup to type the value directly -- same pattern
// as the compartment cap's precise-entry popup in PlannerControls.tsx.
type TempDialProps = { value: number; min: number; max: number; step: number; onChange: (v: number) => void };

const TEMP_DIAL_TICKS = Array.from({ length: 12 }, (_, i) => {
  const angle = i * 30 + 9; // slight offset so ticks don't land exactly on the cardinal points
  const big = i % 2 === 0;
  const dist = big ? 116 : 108 + ((i * 37) % 9); // subtle scatter, not a perfect ring
  const rad = (angle * Math.PI) / 180;
  return { cx: 120 + Math.cos(rad) * dist, cy: 120 + Math.sin(rad) * dist, angle, big };
});

export default function TempDial({ value, min, max, step, onChange }: TempDialProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const sweepStart = -135;
  const sweepEnd = 135;
  const sweep = sweepEnd - sweepStart;

  const angleToValue = useCallback((deg: number) => {
    const anchorAngle = -90;
    const degPerUnit = sweep / (max - min || 1);
    const raw = 60 + (clampNum(deg, sweepStart, sweepEnd) - anchorAngle) / (degPerUnit || 1);
    return clampNum(Math.round((Math.round(raw / step) * step) * 10) / 10, min, max);
  }, [min, max, step, sweep, sweepStart, sweepEnd]);

  const setFromPointer = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    onChange(angleToValue(clampNum((Math.atan2(dy, dx) * 180) / Math.PI, sweepStart, sweepEnd)));
  }, [angleToValue, onChange, sweepStart, sweepEnd]);

  function commitTyped() {
    const parsed = clampNum(Math.round((Number(typedValue) || 0) * 10) / 10, min, max);
    onChange(parsed);
    setTyping(false);
  }

  return (
    <div
      ref={ref}
      style={{ width: "100%", maxWidth: 420, margin: "0 auto", aspectRatio: "1/1", position: "relative", touchAction: "none" }}
      onPointerDown={(e) => {
        if (typing) return;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        pointerDownRef.current = { x: e.clientX, y: e.clientY };
        movedRef.current = false;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (typing || !dragging) return;
        const start = pointerDownRef.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) movedRef.current = true;
        if (movedRef.current) setFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        if (typing) return;
        setDragging(false);
        if (!movedRef.current) { setTypedValue(String(value)); setTyping(true); }
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <svg viewBox="0 0 240 240" style={{ width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        {TEMP_DIAL_TICKS.map((t, i) => t.big ? (
          <rect key={i} x={t.cx - 1.5} y={t.cy - 8} width={3} height={16} rx={1.5}
            fill="rgba(255,255,255,0.55)" transform={`rotate(${t.angle + 90} ${t.cx} ${t.cy})`} />
        ) : (
          <rect key={i} x={t.cx - 2} y={t.cy - 2} width={4} height={4}
            fill="rgba(255,255,255,0.28)" transform={`rotate(45 ${t.cx} ${t.cy})`} />
        ))}
      </svg>
      <div style={{ position: "absolute", top: 6, left: 0, right: 0, textAlign: "center", fontWeight: 900, fontSize: 14, color: "rgba(255,255,255,0.55)", pointerEvents: "none" }}>60°F</div>
      <div style={{
        position: "absolute", inset: 0, margin: "auto", width: "68%", height: "68%",
        borderRadius: "50%", pointerEvents: "none",
        background: "radial-gradient(circle at 34% 28%, #ffffff 0%, #f4f4f4 30%, #d9d9d9 62%, #b6b6b6 100%)",
        boxShadow: "0 22px 48px rgba(0,0,0,0.55), inset 0 -12px 26px rgba(0,0,0,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
      }}>
        <div style={{ fontSize: "clamp(28px, 8vw, 40px)", fontWeight: 900, letterSpacing: -0.6, color: "#181818" }}>
          {value.toFixed(1)}°F
        </div>
      </div>

      {/* Tap-to-type -- opens on a tap that didn't drag, anywhere in the widget */}
      {typing && (
        <div
          onClick={(e) => { e.stopPropagation(); setTyping(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 280, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" as const }}>
              Set Temp (°F) for All Products
            </div>
            <input
              type="text" inputMode="decimal" autoFocus
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value.replace(/[^0-9.\-]/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") commitTyped(); }}
              style={{ width: "100%", textAlign: "center" as const, background: "transparent", border: "none", borderBottom: "1px solid rgba(255,255,255,0.20)", color: "#fff", fontSize: 40, fontWeight: 700, padding: "4px 0" }}
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{min}° to {max}°</div>
            <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
              <button type="button" onClick={() => setTyping(false)}
                style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button type="button" onClick={commitTyped}
                style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

