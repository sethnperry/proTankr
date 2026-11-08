"use client";
// app/planner/dispatch/PlanLoadCard.tsx
//
// LIVE mode driver list: ranked cards for the roster, with equipment and hours.
// (Plan mode finds drivers with DriverFinder.) Presentational.

import React, { useMemo, useState } from "react";
import { useDashLook } from "../home/dashLook";
import { EXPIRY_COLOR } from "@/lib/expiry";
import type { PlanDriver, PlanLoadResult } from "@/lib/dispatch/planLoad";
import { locationPlace, locationTitle, type DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { fieldInput } from "../components/trip/tripUi";
import type { TrailerCert } from "@/lib/dispatch/certs";
import { certBlocks } from "@/lib/dispatch/certs";

// What a driver holds, and (when the terminal requires one) the trailer's certificate.
export type DriverEquip = {
  truck: string; trailer: string; since: string | null;
  cert: TrailerCert | null;
  thumb: { url: string | null; isPdf: boolean } | null;
};

const mdy = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${m}/${d}/${y.slice(2)}`; };

function EquipLine({ e, terminal }: { e: DriverEquip; terminal: string | null }) {
  const L = useDashLook();
  const c = e.cert;
  const bad = certBlocks(c);
  const color = !c ? L.muted : c.kind === "missing" ? EXPIRY_COLOR.expired : EXPIRY_COLOR[c.state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, fontSize: 12 }}>
      <span className="dash-num" style={{ color: L.muted, flexShrink: 0 }}>
        Truck {e.truck} · Trailer {e.trailer}{e.since ? ` · since ${mdy(e.since)}` : ""}
      </span>
      {c && (
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {e.thumb && (
            e.thumb.url ? (
              <span role="button" tabIndex={0} aria-label="Open certificate" onClick={(ev) => { ev.stopPropagation(); window.open(e.thumb!.url!, "_blank"); }}
                style={{ width: 26, height: 26, flexShrink: 0, border: `1px solid ${L.hairline}`, background: `center / cover url(${e.thumb.url})`, cursor: "pointer" }} />
            ) : (
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: L.muted, border: `1px solid ${L.hairline}`, padding: "3px 4px" }}>{e.thumb.isPdf ? "PDF" : "DOC"}</span>
            )
          )}
          <span className="dash-num" style={{ fontWeight: 800, color, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.kind === "missing"
              ? `No ${terminal ?? "terminal"} cert`
              : c.days < 0 ? `Cert expired ${mdy(c.iso)}` : `Cert ${mdy(c.iso)} · ${c.days}d`}
            {bad ? " ⚠" : ""}
          </span>
        </span>
      )}
    </div>
  );
}

export type TerminalOption = { id: string; name: string; place: string | null; used: boolean; city?: string | null; state?: string | null };

function accessText(d: PlanDriver): { text: string; color: string } | null {
  if (!d.access) return null;
  const { state, days } = d.access;
  if (state === "none") return { text: "No access", color: EXPIRY_COLOR.expired };
  if (state === "expired") return { text: `Expired ${-(days ?? 0)}d ago`, color: EXPIRY_COLOR.expired };
  return { text: `Access ${days}d`, color: EXPIRY_COLOR[state] };
}

function DriverRow({ d, onOpen, onSelect, selected, equip, terminal, hos, canPlan }: { hos?: { text: string; color: string } | null; d: PlanDriver; onOpen: (id: string) => void; onSelect: (id: string) => void; selected: boolean; equip?: DriverEquip | null; terminal: string | null; canPlan: boolean }) {
  const L = useDashLook();
  const acc = accessText(d);
  return (
    <div role="button" tabIndex={0} onClick={() => onSelect(d.userId)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(d.userId); }} className="dash-press"
      style={{ ...L.secondary, borderColor: selected ? "#fff" : undefined, boxSizing: "border-box", width: "100%", textAlign: "left", color: "#fff", padding: "9px 12px", marginBottom: 6,
        cursor: "pointer", opacity: d.count === 0 ? 0.65 : 1 }}>
     <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {d.name}{d.busy && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#93c5fd" }}>{d.busy}</span>}
      </span>
      {acc && <span className="dash-num" style={{ fontSize: 12, fontWeight: 800, color: acc.color }}>{acc.text}</span>}
      <span className="dash-num" style={{ fontSize: 12, color: L.muted, minWidth: 74, textAlign: "right" }}>
        {d.count > 0 ? `${d.count} here` : "not here yet"}
      </span>
      <span style={{ color: L.faint, fontSize: 12 }}>{selected ? "▲" : "▼"}</span>
     </div>
     {equip && <EquipLine e={equip} terminal={terminal} />}
     {hos && <div className="dash-num" style={{ fontSize: 11, marginTop: 3, color: hos.color }}>Hours · {hos.text}</div>}
     {selected && (
       <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${L.hairline}`, display: "flex", alignItems: "center", gap: 10 }}>
         <span style={{ flex: 1, fontSize: 12, color: L.muted }}>
           {canPlan ? "Timeline is open above." : "Pick a drop location and a terminal to build their timeline."}
         </span>
         <button type="button" onClick={() => onOpen(d.userId)} className="dash-press"
           style={{ ...L.secondary, color: "#fff", padding: "7px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Open driver file ›</button>
       </div>
     )}
    </div>
  );
}

/** The one driver list: ranked cards for the whole roster. Tap a card to select the driver (builds the
 *  timeline once a drop location and terminal are picked); the open card has the driver-file button. */
export function DriverList(p: {
  result: PlanLoadResult;
  showNotCarded: boolean;
  location: DeliveryLocation | null;
  terminal: TerminalOption | null;
  historyLoading?: boolean;
  historyError?: string | null;
  selectedDriverId: string | null;
  onSelectDriver: (userId: string) => void;
  onOpenDriver: (userId: string) => void;
  equipFor?: (userId: string) => DriverEquip | null;
  hosFor?: (userId: string) => { text: string; color: string } | null;
}) {
  const L = useDashLook();
  const [search, setSearch] = useState("");
  const all = p.showNotCarded ? p.result.notCarded : p.result.ready;
  const list = useMemo(() => {
    const t = search.trim().toLowerCase();
    return t ? all.filter((d) => d.name.toLowerCase().includes(t)) : all;
  }, [all, search]);
  const canPlan = !!p.location && !!p.terminal;
  return (
    <div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers…" style={{ ...fieldInput, marginBottom: 8 }} />
      <div style={{ fontSize: 11, color: L.faint, margin: "2px 0 6px" }}>
        {p.showNotCarded
          ? "Delivered here before, but no usable access at this terminal."
          : p.location ? "Most deliveries here first." : "Tap a driver to open their card."}
        {p.historyLoading && " Loading…"}
      </div>
      {p.historyError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>{p.historyError}</div>}
      {list.length === 0 ? (
        <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>
          {p.showNotCarded ? "Everyone who delivers here is carded at this terminal." : "No drivers to show."}
        </div>
      ) : list.map((d) => (
        <DriverRow key={d.userId} d={d} onOpen={p.onOpenDriver} onSelect={p.onSelectDriver} selected={p.selectedDriverId === d.userId}
          equip={p.equipFor?.(d.userId) ?? null} hos={p.hosFor?.(d.userId) ?? null} terminal={p.terminal?.name ?? null} canPlan={canPlan} />
      ))}
    </div>
  );
}
