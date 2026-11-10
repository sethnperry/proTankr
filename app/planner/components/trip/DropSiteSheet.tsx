"use client";
// app/planner/components/trip/DropSiteSheet.tsx
//
// The drop site window, opened by Arrive at a delivery. Two states:
//   arrived  - arrival time and wait, the site board, Begin Delivery (stamps the pumping start) and Delay.
//   begun    - the before readings, in the same blown-up entry window the drop sequence uses, one product at a
//              time (tanks prefilled with the last driver's ending reading), then the room left at 100% and 90%
//              of capacity and whether the load fits. Delay and Finish.
// Readings are optional: Finish works with none entered, because the timestamps are what matter.
import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import ValueEntryOverlay from "@/app/planner/components/ValueEntryOverlay";
import { ullage } from "@/lib/trips/ullage";

export type DropTank = { number: string; capacity: number | null; last: number | null };
/** A product on this delivery with every store tank that holds it. */
export type DropProduct = { id: string | null; name: string; color: string; gallons: number; tanks: DropTank[] };

const muted = "rgba(255,255,255,0.5)";
const hair = "rgba(255,255,255,0.12)";
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted };
const gal = (n: number) => `${Math.round(n).toLocaleString("en-US")} gal`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const primary: React.CSSProperties = { width: "100%", padding: "18px 0", fontSize: 18, fontWeight: 800, background: "#fff", color: "#000", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" };

export function DropSiteSheet({ open, siteName, arrivedAt, beganAt, board, products, delay, onBegin, onFinish, onClose }: {
  open: boolean; siteName: string; arrivedAt: string; beganAt: string | null;
  /** The site board (other trucks, recent drops), drawn by the page. */
  board: React.ReactNode;
  products: DropProduct[];
  /** The Delay button, drawn by the page (it owns the running delay). */
  delay: React.ReactNode;
  onBegin: () => void;
  /** Before readings (gallons by tank number) the driver confirmed; empty when none. */
  onFinish: (volumes: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [vol, setVol] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<number>>(new Set()); // products whose window was passed with Next or Done
  const [idx, setIdx] = useState<number | null>(null);      // the product whose window is open
  // Seed from the last ending readings, and open the first product's window, when the delivery begins.
  useEffect(() => {
    if (!open || !beganAt) return;
    setVol(Object.fromEntries(products.flatMap((p) => p.tanks).map((t) => [t.number, t.last != null ? String(Math.round(t.last)) : ""])));
    setDone(new Set());
    setIdx(products.some((p) => p.tanks.length) ? products.findIndex((p) => p.tanks.length) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, beganAt]);
  const num = (n: string) => { const v = parseFloat((vol[n] ?? "").replace(/,/g, "")); return Number.isFinite(v) ? v : null; };
  const allTanks = products.flatMap((p) => p.tanks);
  const loadGallons = products.reduce((n, p) => n + p.gallons, 0);
  const u = useMemo(() => ullage(allTanks.map((t) => ({ capacity: t.capacity, volume: num(t.number) })), loadGallons), [products, vol]); // eslint-disable-line react-hooks/exhaustive-deps
  const waited = Math.max(0, Math.round((Date.now() - Date.parse(arrivedAt)) / 60000));
  const finish = () => {
    // The prefill is the last driver's ending reading, not this driver's: it counts once the product's window was
    // passed, or when the driver changed it.
    const out: Record<string, number> = {};
    products.forEach((p, i) => p.tanks.forEach((t) => { const v = num(t.number); if (v != null && (done.has(i) || v !== t.last)) out[t.number] = v; }));
    onFinish(out);
  };
  const cur = idx != null ? products[idx] : null;
  const next = () => {
    if (idx == null) return;
    setDone((d) => new Set(d).add(idx));
    const after = products.findIndex((p, i) => i > idx && p.tanks.length);
    setIdx(after >= 0 ? after : null);
  };
  const back = () => {
    if (idx == null) return;
    const before = [...products.keys()].reverse().find((i) => i < idx && products[i].tanks.length);
    setIdx(before ?? null);
  };
  const verdict = u.fit === "fits" ? { text: "Fits within 90%", color: "#4ade80" }
    : u.fit === "tight" ? { text: "Fits, but past 90% of capacity", color: "#fbbf24" }
    : u.fit === "no" ? { text: `Won't fit: ${gal(u.shortBy)} too much`, color: "#f87171" } : null;

  return (
    <>
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
            <div style={{ ...cap, margin: "6px 0 8px", paddingBottom: 6, borderBottom: `1px solid ${hair}` }}>Tank readings before (optional)</div>
            {products.length === 0 && <div style={{ color: muted, fontSize: 14, padding: "8px 0" }}>Nothing aboard for this stop. Finish when you're done.</div>}
            {products.map((p, i) => (
              <button key={p.id ?? `p${i}`} type="button" disabled={!p.tanks.length} onClick={() => setIdx(i)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: `1px solid ${hair}`, color: "#fff", padding: "12px 0", cursor: p.tanks.length ? "pointer" : "default" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 0 }}>{p.name}</span>
                <span style={{ fontSize: 13, color: muted }}>{!p.tanks.length ? "No tank on file" : done.has(i) ? `${p.tanks.length} tank${p.tanks.length === 1 ? "" : "s"} ✓` : "Enter ›"}</span>
              </button>
            ))}
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

      <ValueEntryOverlay
        open={open && !!beganAt && !!cur}
        title={cur ? `${cur.name}${cur.tanks.length === 1 ? ` · Tank ${cur.tanks[0].number}` : ""} · Before` : ""}
        dotColor={cur?.color}
        fields={(cur?.tanks ?? []).map((t) => ({
          key: `before:${t.number}`, label: `Tank ${t.number}`, value: vol[t.number] ?? "", suffix: "gal", decimal: true,
          onChange: (v: string) => setVol((m) => ({ ...m, [t.number]: v })),
        }))}
        hint={cur && cur.tanks.length > 1 ? `Every ${cur.name} tank, even ones you're not dropping into.` : undefined}
        cancelLabel={idx != null && products.findIndex((p) => p.tanks.length) < idx ? "‹ Back" : "Close"}
        onCancel={() => (idx != null && products.findIndex((p) => p.tanks.length) < idx ? back() : setIdx(null))}
        submitLabel={idx != null && !products.some((p, i) => i > idx && p.tanks.length) ? "Done" : "Next"}
        onSubmit={next}
      />
    </>
  );
}
