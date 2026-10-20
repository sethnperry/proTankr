"use client";
// app/planner/dispatch/PlanLoadCard.tsx
//
// PLAN mode: pick a drop location and the drivers who deliver there are listed
// by how often they have; pick a terminal and the list narrows to drivers with
// access there. Presentational: the page owns the picks and the ranking.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
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

export type TerminalOption = { id: string; name: string; place: string | null; used: boolean };

function accessText(d: PlanDriver): { text: string; color: string } | null {
  if (!d.access) return null;
  const { state, days } = d.access;
  if (state === "none") return { text: "No access", color: EXPIRY_COLOR.expired };
  if (state === "expired") return { text: `Expired ${-(days ?? 0)}d ago`, color: EXPIRY_COLOR.expired };
  return { text: `Access ${days}d`, color: EXPIRY_COLOR[state] };
}

function DriverRow({ d, onOpen, onSelect, selected, equip, terminal }: { d: PlanDriver; onOpen: (id: string) => void; onSelect: (id: string) => void; selected: boolean; equip?: DriverEquip | null; terminal: string | null }) {
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
      <button type="button" aria-label={`Open ${d.name}`} onClick={(e) => { e.stopPropagation(); onOpen(d.userId); }}
        style={{ border: "none", background: "transparent", color: L.faint, cursor: "pointer", fontSize: 14, padding: "0 2px" }}>›</button>
     </div>
     {equip && <EquipLine e={equip} terminal={terminal} />}
    </div>
  );
}

function PickRow({ label, value, sub, onPick, onClear }: { label: string; value: string | null; sub?: string | null; onPick: () => void; onClear?: () => void }) {
  const L = useDashLook();
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
      <button type="button" onClick={onPick} className="dash-press"
        style={{ ...L.secondary, boxSizing: "border-box", flex: 1, minWidth: 0, textAlign: "left", color: "#fff", padding: "10px 12px", cursor: "pointer" }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value ? "#fff" : L.muted }}>
          {value ?? "Tap to pick"} {sub && <span style={{ fontWeight: 600, color: L.muted }}>· {sub}</span>} <span style={{ color: L.faint }}>›</span>
        </div>
      </button>
      {onClear && value && (
        <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className="dash-press"
          style={{ ...L.secondary, width: 40, color: L.muted, cursor: "pointer", fontSize: 16 }}>×</button>
      )}
    </div>
  );
}

export function PlanLoadCard(props: {
  location: DeliveryLocation | null;
  terminal: TerminalOption | null;
  terminals: TerminalOption[];
  result: PlanLoadResult;
  historyLoading?: boolean;
  historyError?: string | null;
  showNotCarded: boolean;
  onPickLocation: () => void;
  onClearLocation: () => void;
  onPickTerminal: (id: string | null) => void;
  onOpenDriver: (userId: string) => void;
  // Picked from the terminal's supplier list. A paused contract only warns.
  supplier?: { name: string; account: string | null; warning: string | null } | null;
  onPickSupplier?: () => void;
  onClearSupplier?: () => void;
  // Equipment each driver holds and the terminal's trailer-certification check.
  equipFor?: (userId: string) => DriverEquip | null;
  certNames?: string[]; // certificate(s) the chosen terminal requires on the trailer
  certProblems?: number; // listed drivers whose trailer can't load there
  selectedDriverId?: string | null;
  onSelectDriver?: (userId: string) => void;
  timeline?: React.ReactNode; // the selected driver's timeline
}) {
  const L = useDashLook();
  const p = props;
  const [termOpen, setTermOpen] = useState(false);
  const [q, setQ] = useState("");
  const options = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? p.terminals.filter((t) => `${t.name} ${t.place ?? ""}`.toLowerCase().includes(s)) : p.terminals;
    return [...list].sort((a, b) => Number(b.used) - Number(a.used) || a.name.localeCompare(b.name)).slice(0, 80);
  }, [p.terminals, q]);

  const list = p.showNotCarded ? p.result.notCarded : p.result.ready;
  const planning = !!p.location || !!p.terminal;

  return (
    <div style={{ marginBottom: 6 }}>
      <PickRow label="Drop location" value={p.location ? locationTitle(p.location) : null} sub={p.location ? locationPlace(p.location) : null}
        onPick={p.onPickLocation} onClear={p.onClearLocation} />
      <PickRow label="Terminal" value={p.terminal?.name ?? null} sub={p.terminal?.place ?? null}
        onPick={() => { setQ(""); setTermOpen(true); }} onClear={() => p.onPickTerminal(null)} />

      {p.terminal && p.onPickSupplier && (
        <>
          <PickRow label="Supplier" value={p.supplier?.name ?? null} sub={p.supplier?.account ? `Acct ${p.supplier.account}` : null}
            onPick={p.onPickSupplier} onClear={p.onClearSupplier} />
          {p.supplier?.warning && <div style={{ fontSize: 12, color: "#fb923c", margin: "-2px 0 6px" }}>⚠ {p.supplier.warning}</div>}
        </>
      )}

      {p.terminal && p.certNames && p.certNames.length > 0 && (
        <div style={{ fontSize: 12, color: (p.certProblems ?? 0) > 0 ? "#fb923c" : L.muted, margin: "2px 0 4px" }}>
          Trailer certification required here: {p.certNames.join(", ")}.
          {(p.certProblems ?? 0) > 0 && ` ${p.certProblems} listed driver${p.certProblems === 1 ? "'s" : "s'"} trailer can't load as it stands.`}
        </div>
      )}

      {p.timeline}

      {planning && (
        <>
          <div style={{ fontSize: 11, color: L.faint, margin: "10px 0 6px" }}>
            {p.showNotCarded
              ? "Delivered here before, but no usable access at this terminal."
              : p.location ? "Most deliveries here first." : "Pick a drop location to rank drivers."}
            {p.historyLoading && " Loading…"}
          </div>
          {p.historyError && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 6 }}>{p.historyError}</div>}
          {list.length === 0 ? (
            <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted }}>
              {p.showNotCarded ? "Everyone who delivers here is carded at this terminal." : "No drivers to show."}
            </div>
          ) : list.map((d) => <DriverRow key={d.userId} d={d} onOpen={p.onOpenDriver} onSelect={p.onSelectDriver ?? p.onOpenDriver} selected={p.selectedDriverId === d.userId} equip={p.equipFor?.(d.userId) ?? null} terminal={p.terminal?.name ?? null} />)}
        </>
      )}

      <FullscreenModal open={termOpen} title="Pick the terminal" onClose={() => setTermOpen(false)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminals" style={{ ...fieldInput, marginBottom: 10 }} />
        {options.map((t) => (
          <button key={t.id} type="button" onClick={() => { p.onPickTerminal(t.id); setTermOpen(false); }} className="dash-press"
            style={{ ...L.secondary, boxSizing: "border-box", width: "100%", textAlign: "left", color: "#fff", padding: "10px 12px", marginBottom: 6, cursor: "pointer" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{t.name}</div>
            <div style={{ fontSize: 12, color: L.muted }}>{t.place ?? ""}{t.used ? " · your company loads here" : ""}</div>
          </button>
        ))}
      </FullscreenModal>
    </div>
  );
}
