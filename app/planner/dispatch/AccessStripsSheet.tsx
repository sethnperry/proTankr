"use client";
// app/planner/dispatch/AccessStripsSheet.tsx
//
// A driver's terminal access strips in a pop-out, most urgent city first, so the
// dispatcher sees plainly what is closest to expiring. Hover a terminal for its
// full name and city. In pick mode (choosing a pickup) a carded terminal selects
// and an empty spot (not carded) opens UncardedSheet; "Search terminals" finds a
// city the driver has no card in.
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { TerminalAccessStrip } from "../home/DashboardChrome";
import { useDashLook } from "../home/dashLook";
import { stripUrgency } from "@/lib/dispatch/driverStrips";
import type { ReadinessSummary } from "@/lib/terminals/readiness";

export type CityStrip = { place: string; summary: ReadinessSummary };

export function AccessStripsSheet(p: {
  open: boolean; driverName: string; strips: CityStrip[];
  /** Pick mode only. */
  onPick?: (terminalId: string) => void;
  onUncarded?: (terminalId: string) => void;
  onSearch?: () => void;
  onClose: () => void;
}) {
  const L = useDashLook();
  const first = p.strips.length ? stripUrgency(p.strips[0].summary) : null;
  return (
    <FullscreenModal open={p.open} title={`${p.driverName} · terminal access`} onClose={p.onClose}>
      {first && (
        <div style={{ fontSize: 13, marginBottom: 12, color: first.days <= 7 ? "#fbbf24" : L.muted }}>
          Renew first: <b style={{ color: "#fff" }}>{first.name}</b> · {first.days < 0 ? `expired ${-first.days} days ago` : `${first.days} days left`}
        </div>
      )}
      {p.strips.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 13, color: L.muted, marginBottom: 10 }}>Not carded at any terminal yet.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {p.strips.map((s) => (
          <TerminalAccessStrip key={s.place} place={s.place} summary={s.summary} otherCities={null} onChangeCity={() => {}}
            onOpenTerminal={(id) => { if (id && p.onPick) p.onPick(id); }}
            onOpenSteps={(id) => { if (p.onUncarded) p.onUncarded(id); }} />
        ))}
      </div>
      {p.onSearch && (
        <button type="button" onClick={p.onSearch}
          style={{ display: "block", margin: "14px auto 0", background: "none", border: "none", color: "#93c5fd", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Search terminals ›
        </button>
      )}
    </FullscreenModal>
  );
}

/** The driver is not carded at the terminal just picked: the ways to resolve it, then back to the trip plan. */
export function UncardedSheet(p: {
  open: boolean; driverName: string; terminal: string;
  onMeet: () => void; onPickNew: () => void; onIgnore: () => void; onClose: () => void;
}) {
  const L = useDashLook();
  const btn = { ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "14px", marginBottom: 8, cursor: "pointer", fontSize: 15, fontWeight: 800 } as const;
  return (
    <FullscreenModal open={p.open} title="Not carded here" onClose={p.onClose} footer={null}>
      <div style={{ fontSize: 15, marginBottom: 14 }}>{p.driverName} is not carded at <b>{p.terminal}</b>.</div>
      <button type="button" className="dash-press" onClick={p.onMeet} style={btn}>
        Meet another driver
        <div style={{ fontSize: 12, fontWeight: 400, color: L.muted, marginTop: 3 }}>A carded driver loads with him. Counts as a training load.</div>
      </button>
      <button type="button" className="dash-press" onClick={p.onPickNew} style={btn}>Pick a new terminal</button>
      <button type="button" className="dash-press" onClick={p.onIgnore} style={{ ...btn, color: "#f87171", borderColor: "rgba(248,113,113,0.5)" }}>
        Ignore, plan it anyway
      </button>
    </FullscreenModal>
  );
}
