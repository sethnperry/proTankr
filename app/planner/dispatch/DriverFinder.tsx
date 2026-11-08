"use client";
// app/planner/dispatch/DriverFinder.tsx
//
// Plan a Load, step 1: search for the driver instead of listing everyone.
// Name, employee number, local area, region, or truck number (who has it now,
// and who was in it before). A picked driver opens into a card with their
// status and scheduled start, a Plan Trip button, and their terminal access
// strip for every city they are carded in, as they see it on their dashboard.
import { useMemo, useState } from "react";
import { useDashLook } from "../home/dashLook";
import { TerminalAccessStrip } from "../home/DashboardChrome";
import { fieldInput } from "../components/trip/tripUi";
import { findDrivers, type FinderPerson } from "@/lib/dispatch/driverFinder";
import { driverCityStrips, type StripTerminal } from "@/lib/dispatch/driverStrips";
import type { DriverShift } from "./useDriverDirectory";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const localIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const clock12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

export function shiftLine(s: DriverShift | undefined): string {
  if (!s || !s.start) return "No schedule set";
  const today = new Date().getDay();
  const on = s.days.length === 0 || s.days.includes(today);
  return on ? `Starts ${clock12(s.start)} today${s.end ? ` · ends ${clock12(s.end)}` : ""}` : `Off today · works ${s.days.map((d) => DAYS[d]).join(" ")} from ${clock12(s.start)}`;
}

export function DriverFinder(p: {
  people: FinderPerson[];
  heldTruck: Map<string, string>;
  truckUsers: { truckName: string; driverId: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  statusFor: (id: string) => { busy: string | null; hos: string | null };
  shiftFor: (id: string) => DriverShift | undefined;
  accessFor: (id: string) => { terminal_id: string; carded_on: string | null }[];
  catalog: StripTerminal[];
  equipLine: (id: string) => string | null;
  onPlanTrip: (id: string) => void;
  onOpenDriverFile: (id: string) => void;
}) {
  const L = useDashLook();
  const [q, setQ] = useState("");
  const matches = useMemo(() => findDrivers({ query: q, people: p.people, heldTruck: p.heldTruck, truckUsers: p.truckUsers }), [q, p.people, p.heldTruck, p.truckUsers]);
  const sel = p.selectedId ? p.people.find((x) => x.userId === p.selectedId) ?? null : null;
  const strips = useMemo(() => (sel ? driverCityStrips(p.accessFor(sel.userId), p.catalog, localIso()) : []), [sel, p.accessFor, p.catalog]); // eslint-disable-line react-hooks/exhaustive-deps
  const btn = { ...L.secondary, color: "#fff", padding: "8px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer" } as const;

  if (sel) {
    const st = p.statusFor(sel.userId);
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ ...L.primary, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, flex: 1, minWidth: 0 }}>{sel.name}</span>
            <button type="button" onClick={() => p.onSelect(null)} style={{ background: "none", border: "none", color: L.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>Change driver</button>
          </div>
          <div style={{ fontSize: 12, color: L.muted, marginTop: 3 }}>
            {[sel.employeeNumber ? `#${sel.employeeNumber}` : null, sel.localArea, sel.region].filter(Boolean).join(" · ") || "No area on file"}
          </div>
          <div className="dash-num" style={{ fontSize: 13, marginTop: 8 }}>
            <span style={{ color: st.busy ? "#93c5fd" : "#86efac", fontWeight: 800 }}>{st.busy ?? "Available"}</span>
            {st.hos && <span style={{ color: L.muted }}> · {st.hos}</span>}
          </div>
          <div className="dash-num" style={{ fontSize: 13, marginTop: 3, color: L.muted }}>{shiftLine(p.shiftFor(sel.userId))}</div>
          {p.equipLine(sel.userId) && <div className="dash-num" style={{ fontSize: 12, marginTop: 3, color: L.muted }}>{p.equipLine(sel.userId)}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="dash-press" onClick={() => p.onPlanTrip(sel.userId)} style={{ ...btn, background: "#fff", color: "#000", flex: 1 }}>Plan Trip</button>
            <button type="button" className="dash-press" onClick={() => p.onOpenDriverFile(sel.userId)} style={btn}>Driver file ›</button>
          </div>
        </div>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          {strips.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 13, color: L.muted }}>Not carded at any terminal yet.</div>}
          {strips.map((s) => (
            <TerminalAccessStrip key={s.place} place={s.place} summary={s.summary} onOpenTerminal={() => {}} onOpenSteps={() => {}} onChangeCity={() => {}} otherCities={null} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, employee #, area, region, or truck #" style={{ ...fieldInput, marginBottom: 8 }} />
      {!q.trim() && <div style={{ fontSize: 12, color: L.faint }}>Search to find a driver. A region or area lists everyone in it; a truck number shows who has it and who was in it last.</div>}
      {q.trim() && matches.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>No drivers match.</div>}
      {matches.map((m) => (
        <div key={m.person.userId} role="button" tabIndex={0} className="dash-press" onClick={() => p.onSelect(m.person.userId)} onKeyDown={(e) => { if (e.key === "Enter") p.onSelect(m.person.userId); }}
          style={{ ...L.secondary, boxSizing: "border-box", width: "100%", color: "#fff", padding: "9px 12px", marginBottom: 6, cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.person.name}</span>
          {m.why && <span className="dash-num" style={{ fontSize: 12, color: L.muted }}>{m.why}</span>}
          {p.statusFor(m.person.userId).busy && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#93c5fd" }}>{p.statusFor(m.person.userId).busy}</span>}
          <span style={{ color: L.faint, fontSize: 12 }}>›</span>
        </div>
      ))}
    </div>
  );
}
