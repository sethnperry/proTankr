"use client";
// app/planner/components/equipment/GeotabEquipmentSheet.tsx
//
// "Geotab shows you in Truck 25512": the pop-up that matches ProTankr to Geotab. One sheet for every case (link the
// truck, couple a hooked trailer, go bobtail, take the second seat, become the driver, re-check a deadlined unit).
// A Deadline unit asks first: repairs verified, or still down and only being repositioned.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { deadlinedUnits, type GeoUnit, type Proposal } from "@/lib/equipment/geotabMatch";

const MUTE = "rgba(255,255,255,0.55)";
const white: React.CSSProperties = { display: "block", width: "100%", padding: "14px 18px", border: "none", borderRadius: 2, background: "#fff", color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer", marginTop: 12 };
const dark: React.CSSProperties = { display: "block", width: "100%", padding: "14px 18px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer", marginTop: 10 };

export type Answer = "repairs" | "repositioning";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "");

function DeadlineCard({ kind, unit, answer, onAnswer, busy }: { kind: "truck" | "trailer"; unit: GeoUnit; answer: Answer | undefined; onAnswer: (a: Answer) => void; busy: boolean }) {
  return (
    <div style={{ border: "1px solid rgba(248,113,113,0.6)", padding: 14, marginTop: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: "#f87171" }}>{kind === "truck" ? "Truck" : "Trailer"} {unit.name} is deadlined</div>
      <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
        Deadlined{unit.deadlinedBy ? ` by ${unit.deadlinedBy}` : ""}{unit.statusAt ? ` on ${fmtDate(unit.statusAt)}` : ""}{unit.location ? ` at ${unit.location}` : ""}.
        {unit.notes ? <> Notes: <b>{unit.notes}</b></> : null}
      </div>
      <div style={{ fontSize: 13, color: MUTE, marginTop: 6 }}>Please verify the repairs were completed. If you are only repositioning it, acknowledge: it shows In use while you move it and goes back to Deadline, with these notes, when you park.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <button type="button" disabled={busy} onClick={() => onAnswer("repairs")} style={{ padding: "12px 6px", border: answer === "repairs" ? "2px solid #4ade80" : "1px solid rgba(255,255,255,0.25)", background: answer === "repairs" ? "rgba(74,222,128,0.14)" : "transparent", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Repairs completed</button>
        <button type="button" disabled={busy} onClick={() => onAnswer("repositioning")} style={{ padding: "12px 6px", border: answer === "repositioning" ? "2px solid #fbbf24" : "1px solid rgba(255,255,255,0.25)", background: answer === "repositioning" ? "rgba(251,191,36,0.14)" : "transparent", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Repositioning only</button>
      </div>
    </div>
  );
}

export function GeotabEquipmentSheet({ proposal, onSnooze, onApply, onAnswer }: {
  proposal: Proposal | null;
  /** "Not now": hide this until something changes. */
  onSnooze: () => void;
  /** Does the linking; resolves an error message, or null on success. */
  onApply: () => Promise<string | null>;
  /** Records the repair answer for a deadlined unit; resolves an error message or null. */
  onAnswer: (kind: "truck" | "trailer", unitId: string, a: Answer) => Promise<string | null>;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dead = proposal ? deadlinedUnits(proposal) : [];
  const unanswered = dead.some((d) => !answers[d.unit.id]);
  const trailer = proposal && "trailer" in proposal ? proposal.trailer : null;

  const answer = async (kind: "truck" | "trailer", id: string, a: Answer) => {
    setBusy(true); setErr(null);
    const e = await onAnswer(kind, id, a);
    setBusy(false);
    if (e) setErr(e); else setAnswers((m) => ({ ...m, [id]: a }));
  };
  const apply = async () => {
    setBusy(true); setErr(null);
    const e = await onApply();
    setBusy(false);
    if (e) setErr(e); else setAnswers({});
  };

  const title = !proposal ? "" : proposal.kind === "second_seat" ? "Second seat" : proposal.kind === "promote" ? "You're the driver now" : proposal.kind === "bobtail" ? "Trailer dropped" : proposal.kind === "couple" ? "Trailer hooked" : proposal.kind === "deadline_check" ? "Deadlined equipment" : "Geotab shows you in a truck";
  const primary = !proposal ? "" : proposal.kind === "second_seat" ? "Confirm second seat" : proposal.kind === "promote" ? "Take the wheel" : proposal.kind === "bobtail" ? "Switch to Bobtail" : proposal.kind === "couple" ? "Couple the trailer" : proposal.kind === "deadline_check" ? "Done" : trailer ? `Link ${proposal.truck.name} / ${trailer.name}` : `Link ${proposal.truck.name} (Bobtail)`;

  return (
    <FullscreenModal open={!!proposal} onClose={onSnooze} title={title} footer={null}>
      {proposal && (
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.25 }}>
            {proposal.kind === "second_seat" ? <>Geotab shows you in the second seat of Truck {proposal.truck.name}</>
              : proposal.kind === "promote" ? <>Geotab shows you driving Truck {proposal.truck.name}</>
              : proposal.kind === "bobtail" ? <>Geotab shows no trailer hooked to Truck {proposal.truck.name}</>
              : proposal.kind === "couple" ? <>Geotab shows Trailer {proposal.trailer.name} hooked to Truck {proposal.truck.name}</>
              : proposal.kind === "deadline_check" ? <>Truck {proposal.truck.name} is deadlined</>
              : <>Geotab shows you in Truck {proposal.truck.name}</>}
          </div>
          {proposal.kind === "link" && (
            <div style={{ fontSize: 15, marginTop: 8 }}>
              {trailer ? <>Trailer <b>{trailer.name}</b> is hooked to it.</> : <span style={{ color: "#60a5fa", fontWeight: 800 }}>Bobtail: no trailer hooked.</span>}
              {proposal.holderName && <div style={{ fontSize: 13, color: "#fb923c", marginTop: 6 }}>{proposal.holderName} still has this truck in ProTankr. Linking moves it to you, since Geotab shows you in it.</div>}
            </div>
          )}
          {proposal.kind === "second_seat" && <div style={{ fontSize: 14, color: MUTE, marginTop: 8 }}>{proposal.driverName ? `${proposal.driverName} is driving.` : "Someone else is driving."} When they sign out of Geotab you become the driver.</div>}
          {proposal.kind === "promote" && <div style={{ fontSize: 14, color: MUTE, marginTop: 8 }}>The other driver signed out. This truck and its trailer move to you.</div>}
          {proposal.kind === "bobtail" && <div style={{ fontSize: 14, color: MUTE, marginTop: 8 }}>Your trailer stays where it is and becomes free for someone else.</div>}

          {dead.map((d) => <DeadlineCard key={d.unit.id} kind={d.kind} unit={d.unit} answer={answers[d.unit.id]} busy={busy} onAnswer={(a) => void answer(d.kind, d.unit.id, a)} />)}

          {err && <div style={{ fontSize: 14, color: "#f87171", marginTop: 12 }}>{err}</div>}
          <button type="button" onClick={() => void apply()} disabled={busy || unanswered} aria-busy={busy} style={{ ...white, opacity: busy || unanswered ? 0.5 : 1 }}>{busy ? "Working…" : primary}</button>
          {unanswered && <div style={{ fontSize: 12, color: MUTE, marginTop: 6, textAlign: "center" }}>Answer the deadline question above first.</div>}
          <button type="button" onClick={onSnooze} style={dark}>{proposal.kind === "deadline_check" ? "Later" : "Not now"}</button>
        </div>
      )}
    </FullscreenModal>
  );
}
