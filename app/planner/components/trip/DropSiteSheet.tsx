"use client";
// app/planner/components/trip/DropSiteSheet.tsx
//
// The drop site window, opened by Arrive at a delivery. Two states:
//   arrived  - arrival time and wait, the site board, Begin Delivery (stamps the pumping start) and Delay.
//   begun    - the tank volume calculator: each tank's volume now (prefilled with the last driver's ending reading),
//              the room left at 100% and 90% of capacity, and whether the load fits. Delay and Finish.
// Tank volumes are optional: Finish works with none entered, because the timestamps are what matter.
import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { ullage } from "@/lib/trips/ullage";

/** A store tank. `needed`: it takes a product on this delivery (or has none saved); the others sit behind a tap. */
export type DropTank = { number: string; capacity: number | null; last: number | null; code: string | null; color: string | null; needed: boolean };

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
const gal = (n: number) => `${Math.round(n).toLocaleString("en-US")} gal`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const primary: React.CSSProperties = { width: "100%", padding: "18px 0", fontSize: 18, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" };

export function DropSiteSheet({ open, siteName, arrivedAt, beganAt, board, tanks, loadGallons, delay, onBegin, onFinish, onClose }: {
  open: boolean; siteName: string; arrivedAt: string; beganAt: string | null;
  /** The site board (other trucks, recent drops), drawn by the page. */
  board: React.ReactNode;
  tanks: DropTank[]; loadGallons: number;
  /** The Delay button, drawn by the page (it owns the running delay). */
  delay: React.ReactNode;
  onBegin: () => void;
  /** Volumes the driver entered (gallons by tank number); empty when none. */
  onFinish: (volumes: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [vol, setVol] = useState<Record<string, string>>({});
  const [showOthers, setShowOthers] = useState(false);
  // Seed from the last ending readings each time the calculator opens.
  useEffect(() => {
    if (!open || !beganAt) return;
    setVol(Object.fromEntries(tanks.map((t) => [t.number, t.last != null ? String(Math.round(t.last)) : ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, beganAt]);
  const num = (n: string) => { const v = parseFloat((vol[n] ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
  // Room is counted over the tanks that take this load's products; readings in the others are saved, not counted.
  const needed = tanks.filter((t) => t.needed);
  const others = tanks.filter((t) => !t.needed);
  const u = useMemo(() => ullage(needed.map((t) => ({ capacity: t.capacity, volume: num(t.number) })), loadGallons), [tanks, vol, loadGallons]); // eslint-disable-line react-hooks/exhaustive-deps
  const waited = Math.max(0, Math.round((Date.now() - Date.parse(arrivedAt)) / 60000));
  const finish = () => {
    const out: Record<string, number> = {};
    // The prefill is the last driver's ending reading, not this driver's. It goes in for the tanks taking this
    // load; a tank for another product is saved only if the driver changed it.
    for (const t of tanks) { const v = num(t.number); if (v != null && (t.needed || v !== t.last)) out[t.number] = v; }
    onFinish(out);
  };
  const tankRow = (t: DropTank) => (
    <div key={t.number} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${hair}` }}>
      <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: t.color ?? "rgba(255,255,255,0.25)", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Tank {t.number}{t.code && <span style={{ color: t.color ?? muted, marginLeft: 8, fontSize: 13, fontWeight: 800 }}>{t.code}</span>}</div>
        <div style={{ fontSize: 12, color: muted }}>{t.capacity ? `${gal(t.capacity)} capacity` : "capacity unknown"}</div>
      </div>
      <input inputMode="numeric" value={vol[t.number] ?? ""} placeholder="gal" onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setVol((m) => ({ ...m, [t.number]: e.target.value }))}
        style={{ width: 110, textAlign: "right", background: "#0f0f10", border: `1px solid ${hair}`, color: "#fff", fontSize: 18, fontWeight: 700, padding: "9px 10px", borderRadius: 2 }} />
    </div>
  );
  const verdict = u.fit === "fits" ? { text: "Fits within 90%", color: "#4ade80" }
    : u.fit === "tight" ? { text: "Fits, but past 90% of capacity", color: "#fbbf24" }
    : u.fit === "no" ? { text: `Won't fit: ${gal(u.shortBy)} too much`, color: "#f87171" } : null;

  return (
    <FullscreenModal open={open} title={siteName} onClose={onClose}
      footer={beganAt ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="dash-press" onClick={finish} style={primary}>Finish</button>
          {delay}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button type="button" className="dash-press" onClick={onBegin} style={primary}>Begin Delivery</button>
          {delay}
        </div>
      )}>
      <div style={{ padding: "12px 14px", background: "#0f0f10", border: `1px solid ${hair}`, marginBottom: 12 }}>
        <div style={cap}>{beganAt ? "Delivery began" : "Arrived"}</div>
        <div className="dash-num" style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
          {clock(beganAt ?? arrivedAt)}
          {!beganAt && <span style={{ fontSize: 14, fontWeight: 600, color: muted }}> · waiting {waited} min</span>}
        </div>
        {!beganAt && <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>Tap Begin Delivery when you start. That sets your delivery start time.</div>}
      </div>

      {!beganAt ? board : (
        <>
          <div style={{ ...cap, margin: "6px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${hair}` }}>Tank volumes (optional)</div>
          {tanks.length === 0 && <div style={{ color: muted, fontSize: 14, padding: "8px 0" }}>No tanks on file for this store. Finish when you're done.</div>}
          {needed.map(tankRow)}
          {others.length > 0 && (
            <button type="button" onClick={() => setShowOthers((v) => !v)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${hair}`, color: muted, fontSize: 13, fontWeight: 700, padding: "12px 0", cursor: "pointer" }}>
              {showOthers ? "Hide other tanks" : `Other tanks (${others.length}) ›`}
            </button>
          )}
          {showOthers && others.map(tankRow)}
          <div style={{ marginTop: 14, padding: "12px 14px", background: "#0f0f10", border: `1px solid ${hair}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" }}><span style={{ color: muted }}>Load to deliver</span><b className="dash-num">{gal(loadGallons)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" }}><span style={{ color: muted }}>Room at 100%</span><b className="dash-num">{u.fit ? gal(u.room100) : "—"}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" }}><span style={{ color: muted }}>Room at 90%</span><b className="dash-num">{u.fit ? gal(u.room90) : "—"}</b></div>
            {verdict && <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: verdict.color }}>{verdict.text}</div>}
            {u.missing > 0 && u.counted > 0 && <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>{u.missing} tank{u.missing === 1 ? "" : "s"} without a volume or capacity not counted.</div>}
          </div>
        </>
      )}
    </FullscreenModal>
  );
}
