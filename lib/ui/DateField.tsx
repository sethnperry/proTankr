"use client";
// lib/ui/DateField.tsx
//
// Our own date field (no browser date picker). Shows the date as a button; tap opens a month grid. Value is
// "YYYY-MM-DD" or "". Same look as DateTimePopout, date only.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (v: string): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
export const showDate = (v: string) => { const d = parse(v); return d ? d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : ""; };

const chip = (on: boolean): React.CSSProperties => ({
  padding: "8px 0", borderRadius: 2, cursor: "pointer", fontSize: 13, fontWeight: 700,
  border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.14)"}`, background: on ? "#fff" : "rgba(255,255,255,0.04)", color: on ? "#000" : "#fff",
});

export function DateField({ value, onChange, placeholder = "Set date", style, title = "Date", allowClear = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties; title?: string; allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<Date>(() => parse(value) ?? new Date());
  const [month, setMonth] = useState<Date>(() => { const d = parse(value) ?? new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  useEffect(() => {
    if (!open) return;
    const d = parse(value) ?? new Date();
    setDay(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const today = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ width: "100%", boxSizing: "border-box", textAlign: "left", padding: "9px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", color: value ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 14, fontWeight: 600, cursor: "pointer", ...style }}>
        {value ? showDate(value) : placeholder}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px 16px", overflowY: "auto" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "#161616", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 16, color: "#fff", boxSizing: "border-box" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 0.4, textTransform: "uppercase" }}>{title}</div>
            <div style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 6px" }}>{showDate(iso(day))}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={{ ...chip(false), width: 40 }}>‹</button>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
              <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={{ ...chip(false), width: 40 }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 8 }}>
              {DOW.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.4)" }}>{d}</div>)}
              {cells.map((n, i) => {
                if (n == null) return <div key={i} />;
                const date = new Date(month.getFullYear(), month.getMonth(), n);
                const on = same(date, day);
                return <button key={i} type="button" onClick={() => setDay(date)} style={{ ...chip(on), borderColor: on ? "#fff" : same(date, today) ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.14)" }}>{n}</button>;
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {allowClear && value && <button type="button" onClick={() => { onChange(""); setOpen(false); }} style={{ ...chip(false), flex: 1, padding: "12px 0" }}>Clear</button>}
              <button type="button" onClick={() => setOpen(false)} style={{ ...chip(false), flex: 1, padding: "12px 0" }}>Cancel</button>
              <button type="button" onClick={() => { onChange(iso(day)); setOpen(false); }} style={{ flex: 1, padding: "12px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Set</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
