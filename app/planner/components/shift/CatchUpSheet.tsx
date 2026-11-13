"use client";
// app/planner/components/shift/CatchUpSheet.tsx
//
// End-of-shift catch-up: the truck's tracker saw drives and trailer drops the app has no record of. Each card is
// prefilled with the likely answer, so a driver who did everything the expected way taps "Looks right" once.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { CatchUpCard, DropWhere, LegKind } from "@/lib/shifts/catchUp";

const muted = "rgba(255,255,255,0.55)";
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const chipBase: React.CSSProperties = { padding: "10px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", borderRadius: 2 };

export type CatchUpAnswers = Record<string, LegKind | DropWhere | "ok">;

const LEG_CHOICES: { id: LegKind; label: string }[] = [
  { id: "empty_return", label: "Empty return" },
  { id: "bobtail", label: "Bobtail" },
  { id: "reposition", label: "Reposition" },
  { id: "personal", label: "Personal" },
  { id: "part_of_trip", label: "Part of my trip" },
];
const DROP_CHOICES: { id: DropWhere; label: string }[] = [
  { id: "maintenance", label: "At a shop" },
  { id: "available", label: "Parked, available" },
  { id: "customer", label: "Left at customer" },
];

export function CatchUpSheet({ open, cards, onDone, onSkip }: { open: boolean; cards: CatchUpCard[]; onDone: (a: CatchUpAnswers) => void; onSkip: () => void }) {
  const [answers, setAnswers] = useState<CatchUpAnswers>({});
  useEffect(() => {
    if (!open) return;
    const a: CatchUpAnswers = {};
    for (const c of cards) a[c.id] = c.type === "hook" ? "ok" : c.suggested;
    setAnswers(a);
  }, [open, cards]);
  const set = (id: string, v: CatchUpAnswers[string]) => setAnswers((a) => ({ ...a, [id]: v }));
  const chip = (on: boolean): React.CSSProperties => ({ ...chipBase, border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.2)", background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

  return (
    <FullscreenModal open={open} title="Catch up your day" onClose={onSkip} footer={null}>
      <div style={{ fontSize: 14, color: muted, lineHeight: 1.45, marginBottom: 12 }}>
        Your truck made these moves while the app wasn&apos;t tracking them. Check each one, change what&apos;s wrong, then confirm.
      </div>
      {cards.map((c) => (
        <div key={c.id} style={{ border: "1px solid rgba(255,255,255,0.14)", background: "#0f0f10", padding: 12, marginBottom: 10 }}>
          {c.type === "leg" && (
            <>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{c.fromLabel} → {c.toLabel}</div>
              <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>
                {time(c.startAt)}–{time(c.endAt)} · {c.miles} mi · {c.minutes} min · {c.trailerOn ? `trailer ${c.trailerName ?? ""} attached`.replace("  ", " ") : "no trailer"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {LEG_CHOICES.filter((x) => !(x.id === "empty_return" && !c.trailerOn) && !(x.id === "bobtail" && c.trailerOn)).map((x) => (
                  <button key={x.id} type="button" onClick={() => set(c.id, x.id)} style={chip(answers[c.id] === x.id)}>{x.label}</button>
                ))}
              </div>
            </>
          )}
          {c.type === "drop" && (
            <>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Trailer {c.trailerName} was dropped at {c.placeLabel}</div>
              <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{time(c.at)}. Where does it stand now?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {DROP_CHOICES.map((x) => <button key={x.id} type="button" onClick={() => set(c.id, x.id)} style={chip(answers[c.id] === x.id)}>{x.label}</button>)}
              </div>
            </>
          )}
          {c.type === "hook" && (
            <div style={{ fontSize: 14 }}>Picked up trailer <b>{c.trailerName}</b> at {c.placeLabel} · {time(c.at)}</div>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onDone(answers)}
        style={{ width: "100%", padding: "16px 0", fontSize: 15, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer", marginTop: 4 }}>
        Looks right
      </button>
      <button type="button" onClick={onSkip} style={{ width: "100%", padding: "12px 0", marginTop: 8, fontSize: 13, fontWeight: 700, background: "transparent", color: muted, border: "none", cursor: "pointer" }}>
        Not now. Ask me next time.
      </button>
    </FullscreenModal>
  );
}
