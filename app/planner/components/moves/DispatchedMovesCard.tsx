"use client";
// app/planner/components/moves/DispatchedMovesCard.tsx
//
// The moves dispatch (or the driver) lined up: bobtail, empty, hook trailer, drop trailer. The first one is the big
// button; tapping through them one after another is the day. A bobtail or empty move starts with the odometer (the
// existing stamp) and ends with Arrive like any move; a hook or a drop is one confirm.

import { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { isInstant, stepKindOf, stepLabel } from "@/lib/moves/dispatchedMoves";
import type { EmptyMoveRow } from "@/lib/trips/types";
import { RADIUS } from "@/lib/ui/look";

const muted = "rgba(255,255,255,0.5)", hair = "rgba(255,255,255,0.14)";

export function DispatchedMovesCard({ moves, text, when, onStart, onInstant, blockedBy }: {
  moves: EmptyMoveRow[];
  text: (m: EmptyMoveRow) => string;
  when: (m: EmptyMoveRow) => string | null;
  onStart: (m: EmptyMoveRow) => void;
  onInstant: (m: EmptyMoveRow) => void;
  /** Why the next one can't start yet ("Finish your move first"), if it can't. */
  blockedBy: string | null;
}) {
  const [confirm, setConfirm] = useState<EmptyMoveRow | null>(null);
  if (!moves.length) return null;
  const [next, ...later] = moves;
  const kind = stepKindOf(next);
  const instant = isInstant(kind);
  return (
    <div style={{ border: `1px solid ${hair}`, background: "#0f0f10", borderRadius: RADIUS, padding: 14, marginTop: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted }}>Dispatched · {moves.length} move{moves.length === 1 ? "" : "s"}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{text(next)}</div>
      {when(next) && <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{when(next)}</div>}
      {next.planned_note && <div style={{ fontSize: 13, color: "#fde68a", marginTop: 6 }}>{next.planned_note}</div>}
      <button type="button" className="dash-press" disabled={!!blockedBy}
        onClick={() => (instant ? setConfirm(next) : onStart(next))}
        style={{ width: "100%", marginTop: 12, padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: blockedBy ? "default" : "pointer", opacity: blockedBy ? 0.45 : 1, borderRadius: RADIUS }}>
        {instant ? (kind === "hook" ? "Hook trailer" : "Drop trailer") : `Start ${stepLabel(kind).toLowerCase()}`}
      </button>
      {blockedBy && <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>{blockedBy}</div>}
      {later.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${hair}`, paddingTop: 8 }}>
          {later.map((m, i) => <div key={m.move_id} style={{ fontSize: 13, color: muted, padding: "3px 0" }}>{i + 2}. {text(m)}</div>)}
        </div>
      )}
      <FullscreenModal open={!!confirm} title={confirm ? stepLabel(stepKindOf(confirm)) : ""} onClose={() => setConfirm(null)} footer={
        confirm ? (
          <button type="button" className="dash-press" onClick={() => { const m = confirm; setConfirm(null); onInstant(m); }}
            style={{ width: "100%", padding: "16px 0", fontSize: 16, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", borderRadius: RADIUS }}>
            {stepKindOf(confirm) === "hook" ? "Yes, I hooked it" : "Yes, I dropped it"}
          </button>) : null}>
        {confirm && (
          <>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{text(confirm)}</div>
            <div style={{ fontSize: 14, color: muted, marginTop: 10, lineHeight: 1.45 }}>
              {stepKindOf(confirm) === "hook"
                ? "Confirm once the trailer is hooked. Your equipment window opens next so the truck and trailer are paired here too."
                : "Confirm once the trailer is dropped. The truck goes on as a bobtail."}
            </div>
          </>
        )}
      </FullscreenModal>
    </div>
  );
}
