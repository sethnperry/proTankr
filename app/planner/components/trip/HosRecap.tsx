"use client";
// Cycle Recap: one day per row with a bar, today highlighted, total against the cycle limit.

import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { clockHM } from "@/lib/telematics/progress";
import type { HosAvailability } from "@/lib/telematics/types";

const MUTED = "rgba(255,255,255,0.5)";

function dayName(iso: string, today: boolean): string {
  if (today) return "Today";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function HosRecapModal({ open, hos, onClose }: { open: boolean; hos: HosAvailability; onClose: () => void }) {
  const r = hos.recap;
  const days = r ? [...r.days].reverse() : [];
  const limit = r?.limitMin ?? 70 * 60;
  const used = r?.usedMin ?? 0;
  const pct = Math.min(100, (used / limit) * 100);
  const maxDay = Math.max(60, ...days.map((d) => d.minutes));
  return (
    <FullscreenModal open={open} title="Cycle Recap" onClose={onClose} footer={null}>
      <div style={{ padding: "4px 2px 24px" }}>
        {r ? (
          <>
            <div style={{ border: "1px solid rgba(255,255,255,0.14)", background: "#121213", padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>Cycle available tomorrow</div>
              <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{clockHM(r.availableTomorrowMin)}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Hours you'll have once the oldest day drops off</div>
            </div>
            <div style={{ border: "1px solid rgba(255,255,255,0.14)", background: "#121213", padding: 16 }}>
              {days.map((d, i) => (
                <div key={d.date} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 96, fontSize: 13, fontWeight: i === 0 ? 800 : 500, color: i === 0 ? "#fff" : "rgba(255,255,255,0.75)" }}>{dayName(d.date, i === 0)}</div>
                  <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.08)" }}>
                    <div style={{ width: `${(d.minutes / maxDay) * 100}%`, height: "100%", background: i === 0 ? "#fff" : "rgba(255,255,255,0.45)" }} />
                  </div>
                  <div style={{ width: 52, textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{clockHM(d.minutes)}</div>
                </div>
              ))}
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                  <span>Total · {Math.round(limit / 60)} hr / 8 day</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{clockHM(used)} of {clockHM(limit)}</span>
                </div>
                <div style={{ height: 10, background: "rgba(255,255,255,0.08)" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: pct > 90 ? "#f87171" : pct > 75 ? "#fb923c" : "#fff" }} />
                </div>
                {hos.cycleLeftMin != null && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Cycle left now: {clockHM(hos.cycleLeftMin)}</div>}
              </div>
            </div>
            {r.restartAt && <div style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>34-hour restart ended {new Date(r.restartAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}. Earlier days don't count.</div>}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 12 }}>Worked out from your logged driving and on-duty time. Your logbook is the record.</div>
          </>
        ) : (
          <div style={{ color: MUTED, fontSize: 14 }}>No recap yet. Hours load a few minutes after you connect.</div>
        )}
        {hos.debug && (
          <details style={{ marginTop: 16, fontSize: 11, color: MUTED }}>
            <summary style={{ cursor: "pointer" }}>Hours data (for support)</summary>
            <div style={{ marginTop: 6, fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>
              {Object.entries(hos.debug).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
            </div>
          </details>
        )}
      </div>
    </FullscreenModal>
  );
}
