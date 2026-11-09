"use client";
// app/planner/dispatch/PlanDayCard.tsx
//
// The driver's planned day: trips in run order, rearranged with the arrows
// (start times follow the order, nothing to retype), and one button to send the
// whole day once the report is happy.
import { useDashLook } from "../home/dashLook";
import type { DayReport, DayTrip } from "@/lib/dispatch/validateDay";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clock = (ms: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(ms));

export function PlanDayCard(p: {
  trips: DayTrip[]; report: DayReport | null; startMs: number; onStart: (ms: number) => void;
  onMove: (i: number, dir: -1 | 1) => void; onRemove: (i: number) => void;
  onDispatch: () => void; busy: boolean; msg: { ok: boolean; text: string } | null; unresolved: number;
}) {
  const L = useDashLook();
  const icon = { background: "none", border: "none", color: L.muted, cursor: "pointer", fontSize: 14, padding: "4px 6px" } as const;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: L.muted, flex: 1 }}>Day starts</span>
        <input type="time" value={hhmm(p.startMs)}
          onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); if (Number.isFinite(h)) { const d = new Date(p.startMs); d.setHours(h, m || 0, 0, 0); p.onStart(d.getTime()); } }}
          style={{ background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 14, padding: "6px 8px", borderRadius: 2 }} />
      </div>
      {p.trips.map((t, i) => {
        const r = p.report?.trips[i];
        return (
          <div key={t.id} style={{ ...L.secondary, padding: "8px 10px", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="dash-num" style={{ color: L.muted, width: 16 }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r ? `${r.terminalName} → ${r.locationName}` : "Trip"}
              </div>
              <div className="dash-num" style={{ fontSize: 12, color: L.muted }}>
                {t.orderNumber ? `Order ${t.orderNumber}` : "No order #"}{r ? ` · ${clock(r.startMs)} – ${clock(r.forecast.endMs)}` : ""}
              </div>
            </div>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => p.onMove(i, -1)} style={{ ...icon, opacity: i === 0 ? 0.3 : 1 }}>▲</button>
            <button type="button" aria-label="Move down" disabled={i === p.trips.length - 1} onClick={() => p.onMove(i, 1)} style={{ ...icon, opacity: i === p.trips.length - 1 ? 0.3 : 1 }}>▼</button>
            <button type="button" aria-label="Remove trip" onClick={() => p.onRemove(i)} style={icon}>✕</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {p.trips.length > 0 && (
          <button type="button" className="dash-press" onClick={p.onDispatch} disabled={p.busy}
            style={{ border: "none", background: "#fff", color: "#000", padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", flex: 1, opacity: p.busy ? 0.5 : 1 }}>
            {p.busy ? "Sending…" : `Dispatch ${p.trips.length === 1 ? "trip" : `${p.trips.length} trips`}`}
          </button>
        )}
      </div>
      {p.unresolved > 0 && p.trips.length > 0 && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 6 }}>{p.unresolved} open item{p.unresolved === 1 ? "" : "s"} in the report. Dispatching sends them as warnings.</div>}
      {p.msg && <div style={{ fontSize: 13, marginTop: 8, color: p.msg.ok ? "#86efac" : "#f87171" }}>{p.msg.text}</div>}
    </div>
  );
}
