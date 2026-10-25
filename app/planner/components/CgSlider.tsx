"use client";
// app/planner/components/CgSlider.tsx
//
// Center-of-gravity slider (Rear to Front) with a white puck. The native range
// input is invisible; the puck is drawn on top so it matches the app's look.

export default function CgSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
      <div style={{ marginTop: 18 }}>
        <style jsx global>{`
          input.cgRange { -webkit-appearance: none; appearance: none; background: transparent; height: 24px; }
          input.cgRange:focus { outline: none; }
          input.cgRange::-webkit-slider-runnable-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.10); border: none; }
          input.cgRange::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; margin-top: -9px; background: transparent; border: none; opacity: 0; }
          input.cgRange::-moz-range-track { height: 4px; border-radius: 999px; background: rgba(255,255,255,0.10); border: none; }
          input.cgRange::-moz-range-thumb { width: 22px; height: 22px; background: transparent; border: none; opacity: 0; }
        `}</style>
        <div style={{ position: "relative", width: "100%" }}>
          <input type="range" className="cgRange" min={0} max={1} step={0.005} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ width: "100%" }} disabled={disabled}
          />
          {/* Puck — fixed white now, per explicit direction ("the CG
              handle to white"), no longer accent/theme-driven. */}
          <div aria-hidden style={{
            position: "absolute",
            left: `${Math.max(0, Math.min(1, value)) * 100}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 22, height: 22,
            borderRadius: "50%",
            background: "#ffffff",
            pointerEvents: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 2px", marginTop: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>Rear</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>Front</span>
        </div>
      </div>
  );
}
