"use client";
// lib/ui/PeriodPicker.tsx
//
// The one date-range chooser every report uses: the person's own period (or the company's), the
// usual calendar ranges, optionally All time, and custom dates. It starts on "Last 30 days", then
// moves to "This period" once the period settings load, unless the person already chose.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { periodOptions } from "@/lib/reports/periodOptions";
import { useReportPeriods } from "@/lib/reports/useReportPeriods";
import { lastDays, type DateRange } from "@/lib/reports/dateRange";
import { localDateOf } from "@/lib/worklog/time";

const sel: React.CSSProperties = { colorScheme: "dark", background: "rgba(0,0,0,0.28)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2, padding: "7px 8px", fontSize: 13, minWidth: 0 };

export function PeriodPicker({ companyId, userId, onChange, allowAll = false, defaultAll = false, style }: {
  companyId: string | null | undefined; userId: string | null | undefined;
  onChange: (r: DateRange) => void; allowAll?: boolean; defaultAll?: boolean; style?: React.CSSProperties;
}) {
  const { settings, tz, ready } = useReportPeriods(companyId, userId);
  const today = localDateOf(Date.now(), tz);
  const opts = useMemo(() => periodOptions(settings, today), [settings?.type, settings?.anchor, today]);
  const [id, setId] = useState(defaultAll && allowAll ? "all" : "d:30");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const touched = useRef(false);
  const cb = useRef(onChange); cb.current = onChange;

  const rolling = (n: number) => lastDays(n, Date.now(), tz);
  const rangeFor = (v: string): DateRange | undefined => {
    if (v === "all") return null;
    if (v.startsWith("d:")) return rolling(Number(v.slice(2)));
    if (v === "custom") return custom.start && custom.end && custom.start <= custom.end ? custom : undefined;
    const o = opts.find((x) => x.id === v);
    return o ? { start: o.start, end: o.end } : undefined;
  };

  // Once the settings arrive, open on the current period (unless a choice was already made).
  useEffect(() => {
    if (!ready || touched.current || defaultAll) return;
    const first = settings ? opts.find((o) => o.group === "period") : null;
    if (first) { setId(first.id); cb.current({ start: first.start, end: first.end }); }
  }, [ready, settings?.type, settings?.anchor]); // eslint-disable-line

  const pick = (v: string) => {
    touched.current = true; setId(v);
    const r = rangeFor(v);
    if (r !== undefined) cb.current(r);
  };
  useEffect(() => { if (id === "custom") { const r = rangeFor("custom"); if (r) cb.current(r); } }, [custom.start, custom.end]); // eslint-disable-line

  const choices = [
    ...opts.filter((o) => o.group === "period").map((o) => ({ value: o.id, label: o.label })),
    { value: "d:7", label: "Last 7 days" }, { value: "d:30", label: "Last 30 days" },
    ...opts.filter((o) => o.group === "calendar").map((o) => ({ value: o.id, label: o.label })),
    ...(allowAll ? [{ value: "all", label: "All time" }] : []),
    { value: "custom", label: "Custom dates…" },
  ];

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", ...style }}>
      <div style={{ minWidth: 190, flex: "1 1 190px" }}>
        <CustomSelect value={id} onChange={pick} buttonStyle={{ padding: "8px 34px 8px 10px", fontSize: 13 }} options={choices} />
      </div>
      {id === "custom" && (<>
        <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} style={sel} />
        <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} style={sel} />
      </>)}
    </div>
  );
}
