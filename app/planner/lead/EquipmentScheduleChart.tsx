"use client";
// app/planner/lead/EquipmentScheduleChart.tsx
//
// Lead tab, Dashboard subtab: "who has the equipment and when." Illustrative
// mock data only -- there is no driver-shift-schedule table anywhere in the
// app yet (confirmed via repo search); this component exists to validate
// the chart's look/interaction before any real schema work. Once a real
// shift-schedule feature exists, replace DAY_SHIFT/NIGHT_SHIFT with fetched
// data -- the rendering below only depends on that shape, not on where it
// comes from.
//
// The axis is fixed to always split 50/50 between the two named drivers --
// day shift always occupies the left half, night shift always the right
// half, regardless of how long each shift actually is. The HOURS are what's
// dynamic: tick labels are derived from each driver's actual start/end
// times rather than a static midnight-to-midnight clock, so the two "3"s
// (day starts 3a, night ends 3a) land at the far left/right instead of
// "12". Below the bar, a full week list shows each day full name, with a
// yellow line (spanning to the left edge) when Pedro works that day and a
// blue line (spanning to the right edge) when Seth works it -- today's own
// day name is colored to whichever shift currently holds the equipment
// (yellow before 3pm, blue after), updating live off the same clock.

import React, { useEffect, useState } from "react";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "sun", label: "Sunday" }, { key: "mon", label: "Monday" }, { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" }, { key: "thu", label: "Thursday" }, { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
];
const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type Shift = {
  driverName: string;
  startHour: number; // 0-24
  endHour: number;   // > startHour -- night shift's "3am" is expressed as 27, not 3
  color: string;
  bg: string;
  workDays: Record<DayKey, boolean>;
};

// Matches the chart card's own border color -- the days-list lines are
// deliberately neutral (side + presence already say who works that day;
// the day/night colors stay reserved for the header boxes and bar above).
const DAY_LIST_LINE_COLOR = "rgba(255,255,255,0.08)";
// Fixed width for every day name's own column, sized to fit "Wednesday"
// (the longest label) without wrapping -- keeps every row's line length
// identical instead of varying with each day name's own width.
const DAY_LIST_LABEL_WIDTH = 86;

const DAY_SHIFT: Shift = {
  driverName: "Pedro Guzman",
  startHour: 3,
  endHour: 15,
  color: "#facc15",
  bg: "rgba(250,204,21,0.22)",
  workDays: { sun: false, mon: false, tue: true, wed: true, thu: true, fri: true, sat: true },
};
const NIGHT_SHIFT: Shift = {
  driverName: "Seth Perry",
  startHour: DAY_SHIFT.endHour,
  endHour: DAY_SHIFT.startHour + 24,
  color: "#60a5fa",
  bg: "rgba(96,165,250,0.22)",
  workDays: { sun: true, mon: true, tue: true, wed: true, thu: true, fri: false, sat: false },
};

function hourLabel(h: number): string {
  const h24 = ((h % 24) + 24) % 24;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return String(h12);
}

// 5 evenly-spaced ticks across each half (0%, 25%, 50%, 75%, 100% of that
// shift's own duration) -- the two halves share their boundary tick, so the
// left half's last point is dropped to avoid rendering it twice.
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
function ticksFor(shift: Shift, side: "left" | "right"): { hour: number; pct: number }[] {
  const duration = shift.endHour - shift.startHour;
  const fractions = side === "left" ? TICK_FRACTIONS.slice(0, -1) : TICK_FRACTIONS;
  return fractions.map((f) => ({
    hour: shift.startHour + f * duration,
    pct: side === "left" ? f * 50 : 50 + f * 50,
  }));
}

// Where "now" falls across the fixed 50/50 axis -- generalizes beyond this
// mock's exactly-equal 12h/12h split (if day/night durations ever differ,
// each half still stretches to fill its 50%, just non-linearly relative to
// real clock time within that half).
function nowPercent(hour: number): number {
  const dayDuration = DAY_SHIFT.endHour - DAY_SHIFT.startHour;
  const nightDuration = 24 - dayDuration;
  const sinceDayStart = hour >= DAY_SHIFT.startHour ? hour - DAY_SHIFT.startHour : hour + 24 - DAY_SHIFT.startHour;
  if (sinceDayStart < dayDuration) return (sinceDayStart / dayDuration) * 50;
  return 50 + ((sinceDayStart - dayDuration) / nightDuration) * 50;
}

// `new Date()` differs between server render and client hydration (the
// classic Next.js hydration-mismatch trap) -- state starts null (renders
// identically on server and first client pass) and only picks up the real
// clock in a client-only effect after mount.
function useNow(): { pct: number; label: string; today: DayKey; activeColor: string } | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const hours = now.getHours() + now.getMinutes() / 60;
  const h12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
  const ampm = now.getHours() < 12 ? "AM" : "PM";
  const label = `${h12}:${String(now.getMinutes()).padStart(2, "0")} ${ampm}`;
  const isDayShiftNow = hours >= DAY_SHIFT.startHour && hours < DAY_SHIFT.endHour;
  return {
    pct: nowPercent(hours),
    label,
    today: DAY_KEYS[now.getDay()],
    activeColor: isDayShiftNow ? DAY_SHIFT.color : NIGHT_SHIFT.color,
  };
}

type Props = {
  equipmentLabel?: React.ReactNode;
  // Driver assignment has no backing table yet (same "mock data first" call
  // already made for the rest of this chart) -- these override the mock
  // DAY_SHIFT/NIGHT_SHIFT.driverName defaults when a lead has actually
  // assigned someone via DriverAssignmentModal. Shift times/colors/workday
  // patterns stay the existing mock data either way.
  dayDriverName?: string;
  nightDriverName?: string;
};

export default function EquipmentScheduleChart({ equipmentLabel, dayDriverName, nightDriverName }: Props) {
  const nowInfo = useNow();

  const title = equipmentLabel ?? (
    <>
      <span>Truck · 25184</span>
      <span>Trailer · 3151</span>
    </>
  );

  // Server render and the client's first pass both have nowInfo === null
  // (state starts null, the clock effect hasn't run yet) -- rendering a
  // placeholder here instead of guessing "now"/"today" keeps the two passes
  // identical, avoiding a hydration mismatch. The real chart swaps in on
  // the client-side update right after mount.
  if (!nowInfo) {
    return (
      <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px 14px 12px", minHeight: 120 }}>
        <div style={{ display: "flex", gap: 20, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
          {title}
        </div>
      </div>
    );
  }

  const { pct: nowPct, label: nowLabel, today, activeColor } = nowInfo;
  const ticks = [...ticksFor(DAY_SHIFT, "left"), ...ticksFor(NIGHT_SHIFT, "right")];

  return (
    <>
      <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "14px 14px 12px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 20, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#ef4444" }}>Now: {nowLabel}</div>
        </div>

        {/* Single bar: left half = day shift, right half = night shift, driver
            names centered inside each half (previously separate header boxes
            above -- folded in here since the top-highlight + now-line moving
            onto this element made the two-tier boxes-then-bar layout
            redundant), plus the live "now" line running across it. Height is
            just enough to fit the name text, not a full timeline track. */}
        <div style={{ position: "relative", height: 26 }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", gap: 6 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, background: DAY_SHIFT.bg, borderTop: `2px solid ${DAY_SHIFT.color}`, fontSize: 11, fontWeight: 800, color: DAY_SHIFT.color }}>
              {dayDriverName ?? DAY_SHIFT.driverName}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, background: NIGHT_SHIFT.bg, borderTop: `2px solid ${NIGHT_SHIFT.color}`, fontSize: 11, fontWeight: 800, color: NIGHT_SHIFT.color }}>
              {nightDriverName ?? NIGHT_SHIFT.driverName}
            </div>
          </div>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${nowPct}%`, width: 2, background: "#ef4444", borderRadius: 1, pointerEvents: "none" as const }} />
        </div>

        {/* Hour tick labels -- dynamic per shift, not a fixed clock axis. Now
            below the bar rather than above it. */}
        <div style={{ position: "relative", height: 16, margin: "6px 0 0" }}>
          {ticks.map((t, i) => (
            <div
              key={i}
              style={{
                position: "absolute", left: `${t.pct}%`,
                transform: t.pct === 0 ? "translateX(0)" : t.pct === 100 ? "translateX(-100%)" : "translateX(-50%)",
                fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)",
              }}
            >
              {hourLabel(t.hour)}
            </div>
          ))}
        </div>
      </div>

      {/* Days list, outside the chart card. Lines span from each day name
          out to the card's own left/right edges (matching the bar above)
          -- yellow toward Pedro's side when he works that day, blue toward
          Seth's side when he works it, nothing on a day off. Today's own
          name is colored to whichever shift currently has the equipment. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
        {DAYS.map((d) => {
          const dayWorks = DAY_SHIFT.workDays[d.key];
          const nightWorks = NIGHT_SHIFT.workDays[d.key];
          const isToday = d.key === today;
          return (
            <div key={d.key} style={{ display: "grid", gridTemplateColumns: `1fr ${DAY_LIST_LABEL_WIDTH}px 1fr`, alignItems: "center", gap: 10 }}>
              <div style={{ height: 2, borderRadius: 1, justifySelf: "stretch" as const, background: dayWorks ? DAY_LIST_LINE_COLOR : "transparent" }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? activeColor : "rgba(255,255,255,0.55)", textAlign: "center" as const, whiteSpace: "nowrap" as const }}>
                {d.label}
              </div>
              <div style={{ height: 2, borderRadius: 1, justifySelf: "stretch" as const, background: nightWorks ? DAY_LIST_LINE_COLOR : "transparent" }} />
            </div>
          );
        })}
      </div>
    </>
  );
}
