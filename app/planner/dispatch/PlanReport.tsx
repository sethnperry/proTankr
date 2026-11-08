"use client";
// app/planner/dispatch/PlanReport.tsx
//
// The validation report. Lead with the answer (clean, or what needs a decision),
// then heads-ups, then one line for everything that passed. The timeline only
// opens by itself when a flag is about time; otherwise a single summary line.
import { useState } from "react";
import { useDashLook } from "../home/dashLook";
import { clock, durationText } from "@/lib/dispatch/forecast";
import type { DayReport, FixKind, Issue } from "@/lib/dispatch/validateDay";

const TIME_KINDS = new Set(["gauging", "shift", "driving", "dot14", "rest"]);
const RED = "#f87171", AMBER = "#fbbf24", GREEN = "#86efac";

export function PlanReport(p: {
  driverName: string; report: DayReport; ignored: Set<string>; handled: Record<string, string>;
  onFix: (issue: Issue, fix: FixKind) => void;
}) {
  const L = useDashLook();
  const [open, setOpen] = useState(false);
  const [showPassed, setShowPassed] = useState(false);
  const r = p.report;
  const live = r.issues.filter((i) => !p.ignored.has(i.id) && !p.handled[i.id]);
  const done = r.issues.filter((i) => p.handled[i.id]);
  const ignored = r.issues.filter((i) => p.ignored.has(i.id) && !p.handled[i.id]);
  const decide = live.filter((i) => i.tier === "decide");
  const heads = live.filter((i) => i.tier === "heads");
  const timeFlag = live.some((i) => TIME_KINDS.has(i.kind));
  const showTimeline = open || timeFlag;
  const headline = decide.length ? `${decide.length} thing${decide.length === 1 ? "" : "s"} to decide` : heads.length ? "Works, with heads-ups" : "Clean plan";
  const color = decide.length ? RED : heads.length ? AMBER : GREEN;
  const first = r.trips[0], last = r.trips[r.trips.length - 1];
  const tz = first?.tz ?? null;

  const issueRow = (i: Issue) => (
    <div key={i.id} style={{ ...L.secondary, padding: "10px 12px", marginBottom: 6, borderColor: i.tier === "decide" ? "rgba(248,113,113,0.5)" : undefined }}>
      <div style={{ fontSize: 14, lineHeight: 1.4, color: "#fff" }}>{i.text}</div>
      {(i.fixes.length > 1 || i.tier === "decide") && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {i.fixes.filter((f) => f !== "ignore").map((f) => (
            <button key={f} type="button" className="dash-press" onClick={() => p.onFix(i, f)}
              style={{ ...L.secondary, color: "#fff", padding: "7px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              {f === "meet" ? "Meet another driver" : "Pick a new terminal"}
            </button>
          ))}
          <button type="button" className="dash-press" onClick={() => p.onFix(i, "ignore")}
            style={{ background: "none", border: `1px solid ${RED}`, color: RED, padding: "7px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", borderRadius: 2 }}>Ignore</button>
        </div>
      )}
      {i.fixes.length === 1 && i.tier === "heads" && (
        <button type="button" onClick={() => p.onFix(i, "ignore")} style={{ background: "none", border: "none", color: L.faint, fontSize: 12, padding: 0, marginTop: 6, cursor: "pointer" }}>Dismiss</button>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ ...L.primary, padding: "12px 14px", borderLeft: `3px solid ${color}` }}>
        <div style={{ fontSize: 16, fontWeight: 800, color }}>{headline}</div>
        {first && last && (
          <div className="dash-num" style={{ fontSize: 13, color: L.muted, marginTop: 4 }}>
            {p.driverName} · starts {clock(first.startMs, tz)} · {r.trips.length > 1 ? `${r.trips.length} loads · ` : ""}done {clock(r.endMs, tz)} · {r.shiftHours.toFixed(1)} h shift
          </div>
        )}
        {r.trips.map((t, i) => (
          <div key={t.trip.id} className="dash-num" style={{ fontSize: 12, color: L.muted, marginTop: 3 }}>
            {r.trips.length > 1 ? `${i + 1}. ` : ""}Loads {clock(t.loadStartMs, t.tz)} at {t.terminalName} · drops {clock(t.forecast.endMs, t.tz)} at {t.locationName}
          </div>
        ))}
      </div>

      {decide.length > 0 && <div style={{ marginTop: 10 }}>{decide.map(issueRow)}</div>}
      {heads.length > 0 && <div style={{ marginTop: 10 }}>{heads.map(issueRow)}</div>}

      {done.map((i) => <div key={i.id} style={{ fontSize: 13, color: GREEN, marginTop: 8 }}>✓ {p.handled[i.id]}</div>)}
      {ignored.length > 0 && (
        <div style={{ fontSize: 12, color: L.faint, marginTop: 6 }}>Ignored: {ignored.map((i) => i.text).join(" · ")}</div>
      )}

      {r.passed.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setShowPassed((v) => !v)} style={{ background: "none", border: "none", color: L.muted, fontSize: 13, padding: 0, cursor: "pointer" }}>
            ✓ {r.passed.length} check{r.passed.length === 1 ? "" : "s"} passed {showPassed ? "▲" : "▼"}
          </button>
          {showPassed && <div style={{ fontSize: 12, color: L.faint, marginTop: 4 }}>{r.passed.join(" · ")}</div>}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {!timeFlag && (
          <button type="button" onClick={() => setOpen((v) => !v)} style={{ background: "none", border: "none", color: L.muted, fontSize: 13, padding: 0, cursor: "pointer" }}>
            Timeline {open ? "▲" : "▼"}
          </button>
        )}
        {showTimeline && r.trips.map((t, i) => (
          <div key={t.trip.id} style={{ ...L.secondary, padding: "8px 12px", marginTop: 6 }}>
            {r.trips.length > 1 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: L.muted, marginBottom: 4 }}>Trip {i + 1}</div>}
            {t.forecast.segments.map((s) => (
              <div key={s.key + s.startMs} className="dash-num" style={{ display: "flex", gap: 8, fontSize: 12, padding: "2px 0", color: s.key === "gauging" ? AMBER : "#fff" }}>
                <span style={{ width: 118, color: s.key === "gauging" ? AMBER : L.muted }}>{clock(s.startMs, t.tz)} – {clock(s.endMs, t.tz)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
                <span style={{ color: L.muted }}>{durationText(s.minutes)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
