"use client";
// app/planner/dispatch/MeetDriverSheet.tsx
//
// "Meet another driver" for a trip at a terminal the driver is not carded at.
// Lists the loads already planned at that terminal (driver and ETA), plus a
// search for any other carded driver. Picking one shows what the wait costs
// each of them; sending puts a plain notice on both dashboards. No pairing.
import { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { fieldInput } from "../components/trip/tripUi";
import { meetConsequence } from "@/lib/dispatch/validateDay";
import { clock } from "@/lib/dispatch/forecast";

export type MeetCandidate = { id: string; name: string; etaMs: number; endMs: number; startMs: number; planned: boolean };

export function MeetDriverSheet(p: {
  open: boolean; terminal: string; tz: string | null; maxShiftHours: number;
  mine: { id: string; name: string; arriveMs: number; startMs: number; endMs: number };
  planned: MeetCandidate[];     // loads already planned at this terminal, carded drivers only
  others: MeetCandidate[];      // any other carded driver, for the search
  busy: boolean; error: string | null;
  onSend: (c: MeetCandidate) => void; onClose: () => void;
}) {
  const L = useDashLook();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<MeetCandidate | null>(null);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? p.others.filter((o) => o.name.toLowerCase().includes(s) && !p.planned.some((x) => x.id === o.id)).slice(0, 12) : [];
  }, [q, p.others, p.planned]);
  const m = pick ? meetConsequence(
    { name: p.mine.name, arriveMs: p.mine.arriveMs, endMs: p.mine.endMs, startMs: p.mine.startMs },
    { name: pick.name, arriveMs: pick.etaMs, endMs: pick.endMs, startMs: pick.startMs },
  ) : null;
  const row = (c: MeetCandidate) => (
    <button key={c.id + c.etaMs} type="button" className="dash-press" onClick={() => setPick(c)}
      style={{ ...L.secondary, display: "flex", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontWeight: 800 }}>{c.name}</span>
      <span className="dash-num" style={{ color: L.muted }}>{c.planned ? "" : "no plan · "}ETA {clock(c.etaMs, p.tz)}</span>
    </button>
  );
  const close = () => { setPick(null); setQ(""); p.onClose(); };
  return (
    <FullscreenModal open={p.open} title={pick ? "Meet to load" : `Meet at ${p.terminal}`} onClose={close}>
      {!pick ? (
        <>
          <div style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>{p.mine.name} isn't carded here. Pick a carded driver to load with. Each ETA is to {p.terminal}.</div>
          {p.planned.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted, margin: "6px 0" }}>Already loading here</div>}
          {p.planned.map(row)}
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: L.muted, margin: "12px 0 6px" }}>Another carded driver</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drivers" style={{ ...fieldInput, marginBottom: 8 }} />
          {hits.map(row)}
          {q.trim() && hits.length === 0 && <div style={{ fontSize: 13, color: L.muted }}>No carded driver matches.</div>}
        </>
      ) : m && (
        <>
          {m.sides.map((s) => (
            <div key={s.name} style={{ ...L.secondary, padding: "10px 12px", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{s.name}</div>
              <div className="dash-num" style={{ fontSize: 13, color: L.muted, marginTop: 4 }}>Arrives {clock(s.arriveMs, p.tz)}</div>
              <div className="dash-num" style={{ fontSize: 13, marginTop: 2, color: s.waitMin > 0 ? "#fbbf24" : L.muted }}>
                {s.waitMin > 0 ? `Waits ${s.waitMin} min for ${s.name === m.first ? m.second : m.first}` : "No wait"}
              </div>
              <div className="dash-num" style={{ fontSize: 13, marginTop: 2, color: s.shiftHours > p.maxShiftHours ? "#f87171" : L.muted }}>
                Done about {clock(s.newEndMs, p.tz)} · {s.shiftHours.toFixed(1)} h shift{s.shiftHours > p.maxShiftHours ? ` (limit ${p.maxShiftHours} h)` : ""}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 12, color: L.muted, marginBottom: 10 }}>Counts as a training load for {p.mine.name}. Sending puts a notice on both drivers' dashboards; they add any wait to their own trip.</div>
          {p.error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{p.error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="dash-press" onClick={() => setPick(null)} style={{ ...L.secondary, color: "#fff", padding: "12px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Back</button>
            <button type="button" className="dash-press" disabled={p.busy} onClick={() => p.onSend(pick)}
              style={{ flex: 1, border: "none", background: "#fff", color: "#000", padding: "12px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: p.busy ? 0.5 : 1 }}>
              {p.busy ? "Sending…" : "Send notices"}
            </button>
          </div>
        </>
      )}
    </FullscreenModal>
  );
}
