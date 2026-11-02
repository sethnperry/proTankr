"use client";
// lib/ui/SignaturePad.tsx
//
// The signature pad and its read-only view, shared by every form that signs: the consignee at a delivery, the
// driver's saved signature, safety meeting sign-in, the LTS manifest. Stored as SVG path data in a 300 x 100
// box, so it prints and stretches without a picture file.

import React, { useEffect, useRef, useState } from "react";

const clearBtn: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: 0, marginTop: 6 };

const SIG_W = 300, SIG_H = 100;

export function SignatureView({ path, height = 60 }: { path: string; height?: number }) {
  return (
    <svg viewBox={`0 0 ${SIG_W} ${SIG_H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="xMidYMid meet">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// `fill`: as big as the screen allows at the signature's 3:1 shape (the
// consignee pop-out in landscape). Same shape as always, so the saved
// signature isn't stretched.
export function SignaturePad({ onChange, fill, initial }: { onChange: (path: string | null) => void; fill?: boolean; initial?: string | null }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [path, setPath] = useState(initial ?? "");
  const drawing = useRef(false);
  const pathRef = useRef(initial ?? "");

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIG_W;
    const y = ((e.clientY - r.top) / r.height) * SIG_H;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const set = (p: string) => {
    pathRef.current = p;
    setPath(p);
  };

  useEffect(() => onChange(path.length > 20 ? path : null), [path, onChange]);

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${SIG_W} ${SIG_H}`}
        style={fill
          ? { width: "min(100%, calc((100dvh - 130px) * 3))", aspectRatio: "3 / 1", height: "auto", margin: "0 auto", background: "#fff", borderRadius: 2, touchAction: "none", display: "block", color: "#000" }
          : { width: "100%", height: 120, background: "#fff", borderRadius: 2, touchAction: "none", display: "block", color: "#000" }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drawing.current = true;
          set(`${pathRef.current} M ${point(e)}`.trim());
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          set(`${pathRef.current} L ${point(e)}`);
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
      >
        <path d={path} fill="none" stroke="#000" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <button type="button" onClick={() => set("")} style={clearBtn}>Clear</button>
    </div>
  );
}

