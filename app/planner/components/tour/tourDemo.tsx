"use client";
// app/planner/components/tour/tourDemo.tsx
//
// Demo pieces for the Driver Dashboard tour. Real components with made-up data
// (a driver, truck 25184 / trailer 3151, Tampa to Ft. Myers), so the tour looks
// exactly like the dashboard without touching anyone's real trip.

import React from "react";
import { GaugePanel } from "../../home/DashboardChrome";
import { LOOK } from "../../home/dashLook";
import { CompartmentStrip, type StripSlot } from "../trip/CompartmentStrip";

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { ...LOOK.primary, padding: 14 };
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5 };

const SLOTS: StripSlot[] = [
  { comp: 1, size: 3000, color: "#facc15" }, { comp: 2, size: 3000, color: "#ffffff" }, { comp: 3, size: 3000, color: "#facc15" },
];

type Hot = "expiration" | "loads" | "rack" | "drop" | null;

export function DemoChips({ hot }: { hot: Hot }) {
  // The highlighted chip stays bright; the others dim so the eye lands on the one being explained.
  const dim = (k: Hot) => (hot && hot !== k ? "rgba(255,255,255,0.22)" : undefined);
  return (
    <GaugePanel top={0} cells={[
      { label: "Expiration", value: "2", color: dim("expiration") ?? "#fb923c" },
      { label: "Loads", value: "1", color: dim("loads") ?? "#93c5fd" },
      { label: "To Rack", value: "2", unit: "trks", color: dim("rack") ?? "#f87171" },
      { label: "To Drop", value: "2", unit: "loads", color: dim("drop") ?? "#f87171" },
    ]} />
  );
}

export function DemoHours() {
  const c = (l: string, v: string, color = "#fff") => ({ label: l, value: v, color });
  return <GaugePanel top={0} labelBelow cells={[c("Break", "0m"), c("Driving", "6:12"), c("Working", "8:40"), c("Cycle", "41:05", "#fb923c")]} />;
}

export function DemoTripCard({ showOrder = true }: { showOrder?: boolean }) {
  return (
    <div>
      {showOrder && (
        <div style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: LOOK.muted }}>
          <span style={{ fontSize: 12, letterSpacing: 0.5, marginRight: 8, alignSelf: "baseline" }}>PTD ›</span>4970324
        </div>
      )}
      <div style={card}>
        <div style={{ marginBottom: 8 }}><CompartmentStrip slots={SLOTS} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={label}>Current trip · In transit</span>
          <span style={{ fontSize: 19, fontWeight: 900, color: "#4ade80" }}>79,420<span style={{ fontSize: 10, color: LOOK.muted, marginLeft: 3 }}>LBS</span></span>
        </div>
        <div style={{ fontSize: 13, color: muted }}>Musket → Loves</div>
        <div style={{ fontSize: 14, marginTop: 10, display: "flex", gap: 6 }}>
          <span style={{ color: "#4ade80", width: 66 }}>Loaded</span><span style={{ flex: 1, color: muted }}>Tampa, FL</span><span style={{ color: muted }}>Marathon</span>
        </div>
        <div style={{ fontSize: 14, marginTop: 4, display: "flex", gap: 6 }}>
          <span style={{ color: "#fff", width: 66, fontWeight: 700 }}>Delivery</span><span style={{ flex: 1, color: "#fff" }}>Ft. Myers, FL</span><span style={{ color: muted }}>#495 Loves</span>
        </div>
      </div>
    </div>
  );
}

export function DemoBigButton({ text = "Arrive" }: { text?: string }) {
  return (
    <div>
      <div style={{ ...LOOK.cta, padding: "20px 0", fontSize: 20, fontWeight: 800, textAlign: "center" }}>{text}</div>
      <div style={{ textAlign: "center", fontSize: 13, color: muted, marginTop: 6 }}>Tap when arrived at #495 Loves</div>
    </div>
  );
}

export function DemoAlertCard() {
  return (
    <div style={{ ...card, borderColor: "rgba(147,197,253,0.5)" }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>Did you arrive at #495 Loves?</div>
      <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>Your truck stopped at 2:42 PM. Your log changed to On duty.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div style={{ ...LOOK.cta, flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 800, textAlign: "center" }}>Yes · 2:42 PM</div>
        <div style={{ flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 700, textAlign: "center", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 }}>No</div>
      </div>
    </div>
  );
}

export function DemoRecentDeliveries() {
  const rows = [
    { who: "Pedro G.", when: "Today 11:20", gal: "7,800 gal", note: "ULSD 5,000 · Reg 2,800 · tanks after 8,200 / 3,500" },
    { who: "Seth P.", when: "Yesterday 4:05 PM", gal: "6,200 gal", note: "ULSD 6,200 · tank after 9,400" },
    { who: "Carrier B", when: "Mon 9:40 AM", gal: "8,000 gal", note: "ULSD 4,000 · Reg 4,000 · tanks after 7,900 / 6,100" },
    { who: "Kyle T.", when: "Sun 6:15 PM", gal: "5,400 gal", note: "Reg 5,400 · tank after 8,800" },
    { who: "Pedro G.", when: "Sat 2:30 PM", gal: "7,100 gal", note: "ULSD 7,100 · tank after 9,100" },
  ];
  return (
    <div style={card}>
      <div style={{ ...label, marginBottom: 8 }}>Last 5 deliveries · #495 Loves</div>
      {rows.map((r, i) => (
        <div key={i} style={{ padding: "6px 0", borderTop: i ? "1px solid rgba(255,255,255,0.08)" : undefined, fontSize: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><b>{r.who}</b><span style={{ color: muted }}>{r.when} · {r.gal}</span></div>
          <div style={{ color: muted, fontSize: 12 }}>{r.note}</div>
        </div>
      ))}
    </div>
  );
}

export function DemoTerminalCard() {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={label}>Terminal · Marathon, Tampa</span><span style={{ color: "#f87171", fontSize: 12, fontWeight: 800 }}>Long line</span>
      </div>
      <div style={{ fontSize: 13, marginTop: 8, color: muted }}>Reported by another driver 20 min ago. Out of Product: none.</div>
      <div style={{ fontSize: 13, marginTop: 8 }}>ULSD D2 · 36.5 API · 84.9°F</div>
      <div style={{ fontSize: 13 }}>Regular 87 · 60.4 API · 87°F</div>
    </div>
  );
}

export function DemoAccess() {
  const cell = (t: string, on: boolean) => (
    <div key={t} style={{ textAlign: "center", fontSize: 10, color: muted }}>
      <div style={{ width: 30, height: 38, background: on ? "#f1f1f1" : "transparent", border: on ? "none" : "1px solid rgba(255,255,255,0.3)", margin: "0 auto 4px" }} />{t}
    </div>
  );
  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Tampa, FL</div>
      <div style={{ display: "flex", gap: 10 }}>{cell("MA", true)}{cell("BP", false)}{cell("CH", true)}{cell("KM", false)}</div>
      <div style={{ fontSize: 13, marginTop: 10 }}>Next renewal: Marathon in 61 days</div>
    </div>
  );
}

export function DemoTools() {
  const t = ["Plan", "Equipment", "Terminal", "Delivery", "Track", "Fuel", "Cards", "Trips", "Reports"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid rgba(255,255,255,0.12)" }}>
      {t.map((x) => <div key={x} style={{ padding: "16px 0", textAlign: "center", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,0.06)" }}>{x}</div>)}
    </div>
  );
}
