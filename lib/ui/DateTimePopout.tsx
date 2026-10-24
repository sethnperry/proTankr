"use client";
// lib/ui/DateTimePopout.tsx
//
// Our own date and time picker (no browser pickers). A month grid for the day,
// then hour, minute and AM/PM buttons. Opens as a pop-out; Set returns epoch ms.

import React, { useEffect, useState } from "react";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const chip = (on: boolean): React.CSSProperties => ({
  padding: "9px 0", borderRadius: 2, cursor: "pointer", fontSize: 14, fontWeight: 700,
  border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.14)"}`,
  background: on ? "#fff" : "rgba(255,255,255,0.04)", color: on ? "#000" : "#fff",
});
const label: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", margin: "12px 0 6px" };

export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function DateTimePopout({ open, title, valueMs, onSet, onCancel }: {
  open: boolean;
  title: string;
  valueMs: number;
  onSet: (ms: number) => void;
  onCancel: () => void;
}) {
  const [day, setDay] = useState(() => new Date(valueMs));
  const [month, setMonth] = useState(() => new Date(new Date(valueMs).getFullYear(), new Date(valueMs).getMonth(), 1));
  const [h12, setH12] = useState(12);
  const [min, setMin] = useState(0);
  const [pm, setPm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const d = new Date(valueMs);
    setDay(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setPm(d.getHours() >= 12); setH12(d.getHours() % 12 || 12); setMin(d.getMinutes());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const result = () => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), (h12 % 12) + (pm ? 12 : 0), min, 0, 0);
    return d.getTime();
  };

  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 520, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 16, color: "#fff", boxSizing: "border-box" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" }}>{title}</div>
        <div style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 6px" }}>{formatDateTime(result())}</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            style={{ ...chip(false), width: 40 }}>‹</button>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            style={{ ...chip(false), width: 40 }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 8 }}>
          {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>{d}</div>)}
          {cells.map((n, i) => {
            if (n == null) return <div key={i} />;
            const date = new Date(month.getFullYear(), month.getMonth(), n);
            const on = sameDay(date, day);
            return (
              <button key={i} type="button" onClick={() => setDay(date)}
                style={{ ...chip(on), padding: "8px 0", fontSize: 13, borderColor: on ? "#fff" : sameDay(date, today) ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.14)" }}>{n}</button>
            );
          })}
        </div>

        <div style={label}>Hour</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <button key={h} type="button" onClick={() => setH12(h)} style={chip(h12 === h)}>{h}</button>
          ))}
        </div>
        <div style={label}>Minute</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
          {MINUTES.map((m) => (
            <button key={m} type="button" onClick={() => setMin(m)} style={chip(min === m)}>{String(m).padStart(2, "0")}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <button type="button" onClick={() => setMin((m) => (m + 59) % 60)} style={{ ...chip(false), flex: 1 }}>− 1 min</button>
          <span style={{ fontSize: 14, fontWeight: 800, width: 48, textAlign: "center" }}>:{String(min).padStart(2, "0")}</span>
          <button type="button" onClick={() => setMin((m) => (m + 1) % 60)} style={{ ...chip(false), flex: 1 }}>+ 1 min</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 10 }}>
          <button type="button" onClick={() => setPm(false)} style={chip(!pm)}>AM</button>
          <button type="button" onClick={() => setPm(true)} style={chip(pm)}>PM</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onCancel}
            style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={() => onSet(result())}
            style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Set</button>
        </div>
      </div>
    </div>
  );
}
