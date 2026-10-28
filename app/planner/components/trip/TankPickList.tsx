"use client";
// app/planner/components/trip/TankPickList.tsx
//
// The tank buttons in the drop-into picker. Tap picks a tank; press and hold a button, then drag
// it up or down, to put the tanks in the order the driver wants (east, center, west).

import React, { useRef, useState } from "react";

const HOLD_MS = 350;

export function TankPickList({ names, selected, style, selectedBorder, label, onChoose, onReorder }: {
  names: string[];
  selected: string | undefined;
  style: React.CSSProperties;
  selectedBorder: string;
  label: (name: string) => string;
  onChoose: (name: string) => void;
  onReorder: (next: string[]) => void;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const hold = useRef<number | null>(null);
  const moved = useRef(false);
  const list = order ?? names;

  const clearHold = () => { if (hold.current != null) { window.clearTimeout(hold.current); hold.current = null; } };
  const down = (n: string, e: React.PointerEvent) => {
    moved.current = false;
    const el = e.currentTarget as HTMLElement;
    const id = e.pointerId;
    clearHold();
    hold.current = window.setTimeout(() => {
      hold.current = null;
      try { el.setPointerCapture(id); } catch { /* pointer already gone */ }
      setLifted(n);
      setOrder([...names]);
      moved.current = true;
    }, HOLD_MS);
  };
  const move = (e: React.PointerEvent) => {
    if (!lifted || !order) return;
    // slot under the finger: the first button whose midpoint is below it
    let target = order.length - 1;
    for (let i = 0; i < order.length; i++) {
      const r = refs.current.get(order[i])?.getBoundingClientRect();
      if (r && e.clientY < r.top + r.height / 2) { target = i; break; }
    }
    const from = order.indexOf(lifted);
    if (from === target) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(target, 0, lifted);
    setOrder(next);
  };
  const up = () => {
    clearHold();
    if (lifted && order) onReorder(order);
    setLifted(null);
    setOrder(null);
  };

  return (
    <>
      {list.map((n) => (
        <button key={n} type="button"
          ref={(el) => { if (el) refs.current.set(n, el); else refs.current.delete(n); }}
          onPointerDown={(e) => down(n, e)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}
          onClick={() => { if (moved.current) { moved.current = false; return; } onChoose(n); }}
          style={{
            ...style, touchAction: lifted ? "none" : "manipulation", userSelect: "none",
            borderColor: lifted === n ? "#93c5fd" : selected === n ? "#fff" : selectedBorder,
            transform: lifted === n ? "scale(1.03)" : undefined, opacity: lifted && lifted !== n ? 0.8 : 1,
          }}>
          {label(n)}
        </button>
      ))}
      {list.length > 1 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Hold and drag to change the order</div>}
    </>
  );
}
