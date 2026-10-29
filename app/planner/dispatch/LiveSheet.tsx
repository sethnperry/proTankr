"use client";
// app/planner/dispatch/LiveSheet.tsx
//
// A list behind one of the Live dashboard's chips (En route, On site, Delayed): the loads in that state,
// grouped, with a search box (driver, truck, trailer, rack or store, order number). Tap a row to open it.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { EXPIRY_COLOR } from "@/lib/expiry";
import { filterLive, KIND_LABEL, type LiveKind, type LiveRow } from "@/lib/dispatch/liveGroups";
import { CardBusy, busyProps } from "@/lib/ui/pending";

const dur = (m: number | null) => (m == null ? "" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`);

export function LiveSheet({ open, title, rows, kinds, showRecovered, onClose, onOpenTrip, openingId }: {
  /** Also list loads whose delay has ended and are moving again, with a new ETA. */
  showRecovered?: boolean;
  open: boolean;
  title: string;
  rows: LiveRow[];
  /** The groups to show, in order. */
  kinds: LiveKind[];
  onClose: () => void;
  onOpenTrip: (tripId: string) => void;
  openingId?: string | null;
}) {
  const L = useDashLook();
  const [q, setQ] = useState("");
  const shown = useMemo(() => filterLive(rows, q), [rows, q]);
  return (
    <FullscreenModal open={open} title={`${title} (${rows.length})`} onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search driver, truck, rack, store or order"
        style={{ width: "100%", boxSizing: "border-box", background: "#0f0f10", border: `1px solid ${L.hairline}`, color: "#fff", fontSize: 15, padding: "11px 12px", borderRadius: 2, marginBottom: 12 }} />
      {rows.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>Nothing here right now.</div>}
      {rows.length > 0 && shown.length === 0 && <div style={{ fontSize: 14, color: L.muted }}>No matches.</div>}
      {(showRecovered ? ([...kinds, "recovered"] as const) : kinds).map((k) => {
        const list = k === "recovered" ? shown.filter((r) => r.recovered) : shown.filter((r) => r.kind === k && !(showRecovered && r.recovered));
        if (!list.length) return null;
        return (
          <div key={k} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, margin: "2px 0 8px" }}>{k === "recovered" ? "Delayed, now moving" : KIND_LABEL[k]} · {list.length}</div>
            {list.map((r) => (
              <button key={r.tripId} type="button" onClick={() => onOpenTrip(r.tripId)} className="dash-press" {...busyProps(openingId === r.tripId)}
                style={{ ...L.secondary, position: "relative", display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "10px 12px", marginBottom: 6, cursor: "pointer", borderColor: r.delayed ? `${EXPIRY_COLOR.expiring}88` : undefined }}>
                <CardBusy on={openingId === r.tripId} />
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.driverName}{r.truckName && <span style={{ fontWeight: 600, color: L.muted }}> · {r.truckName}</span>}
                  </span>
                  {r.minutes != null && (
                    <span className="dash-num" style={{ fontSize: 13, fontWeight: 800, color: r.delayed ? EXPIRY_COLOR.expiring : L.muted }}>{dur(r.minutes)}</span>
                  )}
                </div>
                <div style={{ marginTop: 3, fontSize: 13, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.where}{r.place && <span style={{ color: L.muted }}> · {r.place}</span>}
                </div>
                {r.recovered && (
                  <div style={{ marginTop: 2, fontSize: 12, color: L.muted }}>
                    {KIND_LABEL[r.kind]} · was held {dur(r.delayMin ?? null)}
                    {r.etaMs ? <> · <span style={{ color: "#fff", fontWeight: 800 }}>new ETA {new Date(r.etaMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></> : " · ETA unknown (no truck position)"}
                  </div>
                )}
                {r.orders.length > 0 && <div style={{ marginTop: 2, fontSize: 12, color: L.faint }}>Order {r.orders.join(", ")}{r.trailerName ? ` · Trailer ${r.trailerName}` : ""}</div>}
              </button>
            ))}
          </div>
        );
      })}
    </FullscreenModal>
  );
}

const initialsOfName = (n?: string | null) => (n ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const tagOf = (r: LiveRow) => [String(r.truckName ?? "").replace(/^truck\s*/i, "").trim(), initialsOfName(r.driverName)].filter(Boolean).join("-");
const clockOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** The Delayed chip's window: one line per held-up load, same style as Friction. Tap a line for the detail. */
export function DelayedSheet({ open, rows, mode = "delayed", onClose, onOpenTrip, openingId }: {
  open: boolean;
  /** delayed = held-up loads; enroute / onsite = every load in that state, same layout. */
  mode?: "delayed" | "enroute" | "onsite";
  rows: LiveRow[];
  onClose: () => void;
  onOpenTrip: (tripId: string) => void;
  openingId?: string | null;
}) {
  const L = useDashLook();
  const [sel, setSel] = useState<LiveRow | null>(null);
  const list = useMemo(() => [...rows].sort((a, b) => Number(!!b.delayed) - Number(!!a.delayed) || (b.minutes ?? b.delayMin ?? 0) - (a.minutes ?? a.delayMin ?? 0)), [rows]);
  const at = (r: LiveRow) => (r.recovered ? r.heldAt ?? "the stop" : [r.where, r.place?.split(",")[0]].filter(Boolean).join(", "));
  return (
    <>
      <FullscreenModal open={open} title={`${mode === "delayed" ? "Delayed" : mode === "enroute" ? "En route" : "On site"} (${rows.length})`} onClose={onClose}>
        {list.length === 0 && <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>{mode === "delayed" ? "Nothing is delayed right now." : "Nothing here right now."}</div>}
        {list.map((r) => {
          if (mode !== "delayed") {
            const verb = r.kind === "to_rack" ? "To load at" : r.kind === "to_drop" ? "To deliver to" : r.kind === "loading" ? "Loading at" : "Unloading at";
            return (
              <button key={r.tripId} type="button" className="dash-press" onClick={() => setSel(r)}
                style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "9px 12px", marginBottom: 6, cursor: "pointer", borderColor: r.delayed ? `${EXPIRY_COLOR.expiring}77` : undefined }}>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span>{verb.toUpperCase()}</span>
                  <span style={{ fontWeight: 600 }}> {[r.where, r.place?.split(",")[0]].filter(Boolean).join(", ")}</span>
                </div>
                <div style={{ fontSize: 12, color: L.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tagOf(r)}
                  {mode === "enroute" ? (r.etaMs ? ` · ETA ${clockOf(r.etaMs)}` : " · ETA unknown") : ` · ${dur(r.minutes)}`}
                  {r.delayed && <span style={{ color: EXPIRY_COLOR.expiring }}> · delayed</span>}
                </div>
              </button>
            );
          }
          const cause = (r.reason ?? (r.kind === "unloading" ? "Delayed unloading" : r.kind === "loading" ? "Delayed loading" : "Delayed")).toUpperCase();
          return (
            <button key={r.tripId} type="button" className="dash-press" onClick={() => setSel(r)}
              style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", borderColor: `${EXPIRY_COLOR.expiring}77`, opacity: r.recovered ? 0.8 : 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.35 }}>
                <span>{tagOf(r)} </span>
                <span style={{ color: EXPIRY_COLOR.expiring }}>{cause}</span>
                <span style={{ fontWeight: 600 }}> at {at(r)}</span>
                <span style={{ fontWeight: 600, color: L.muted }}> · {dur(r.recovered ? r.delayMin ?? null : r.minutes)}</span>
              </div>
              {r.recovered && (
                <div style={{ fontSize: 13, color: L.muted, marginTop: 2 }}>
                  Now en route to {[r.where, r.place?.split(",")[0]].filter(Boolean).join(", ")}{r.etaMs ? ` - ETA ${clockOf(r.etaMs)}` : ""}
                </div>
              )}
            </button>
          );
        })}
      </FullscreenModal>
      <FullscreenModal open={!!sel} title={sel ? tagOf(sel) : ""} onClose={() => setSel(null)}>
        {sel && (
          <>
            {[
              ["Driver", sel.driverName],
              ["Equipment", [sel.truckName ? `Truck ${sel.truckName}` : null, sel.trailerName ? `Trailer ${sel.trailerName}` : null].filter(Boolean).join(" · ") || null],
              [sel.recovered ? "Was held at" : KIND_LABEL[sel.kind], sel.recovered ? sel.heldAt ?? null : [sel.where, sel.place].filter(Boolean).join(" · ")],
              [sel.recovered ? "Held for" : sel.kind === "to_rack" || sel.kind === "to_drop" ? "On the way" : "Time there", dur(sel.recovered ? sel.delayMin ?? null : sel.minutes) || null],
              ...(sel.delayed || sel.recovered ? [["Reason given", sel.reason ?? "None given"]] : []),
              ...(!sel.recovered && sel.etaMs ? [["ETA", clockOf(sel.etaMs)]] : []),
              ...(sel.recovered ? [["Now", `En route to ${[sel.where, sel.place].filter(Boolean).join(" · ")}`], ["New ETA", sel.etaMs ? clockOf(sel.etaMs) : "Unknown (no truck position)"]] : []),
              ["Order", sel.orders.join(", ") || null],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k as string} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${L.hairline}`, fontSize: 14 }}>
                <span style={{ width: 96, color: L.muted, flexShrink: 0 }}>{k}</span><span style={{ fontWeight: 700 }}>{v}</span>
              </div>
            ))}
            <button type="button" className="dash-press" {...busyProps(openingId === sel.tripId)} onClick={() => { setSel(null); onClose(); onOpenTrip(sel.tripId); }}
              style={{ marginTop: 14, border: "none", background: "#fff", color: "#000", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 16px", cursor: "pointer" }}>
              Open load
            </button>
          </>
        )}
      </FullscreenModal>
    </>
  );
}
