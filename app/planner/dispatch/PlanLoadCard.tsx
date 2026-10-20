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

export type TerminalOption = { id: string; name: string; place: string | null; used: boolean };

function accessText(d: PlanDriver): { text: string; color: string } | null {
  if (!d.access) return null;
  const { state, days } = d.access;
  if (state === "none") return { text: "No access", color: EXPIRY_COLOR.expired };
  if (state === "expired") return { text: `Expired ${-(days ?? 0)}d ago`, color: EXPIRY_COLOR.expired };
  return { text: `Access ${days}d`, color: EXPIRY_COLOR[state] };
}

function DriverRow({ d, onOpen }: { d: PlanDriver; onOpen: (id: string) => void }) {
  const L = useDashLook();
  const acc = accessText(d);
  return (
    <button type="button" onClick={() => onOpen(d.userId)} className="dash-press"
      style={{ ...L.secondary, boxSizing: "border-box", width: "100%", textAlign: "left", color: "#fff", padding: "9px 12px", marginBottom: 6,
        cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8, opacity: d.count === 0 ? 0.65 : 1 }}>
      <span style={{ fontSize: 14, fontWeight: 800, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {d.name}{d.busy && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#93c5fd" }}>{d.busy}</span>}
      </span>
      {acc && <span className="dash-num" style={{ fontSize: 12, fontWeight: 800, color: acc.color }}>{acc.text}</span>}
      <span className="dash-num" style={{ fontSize: 12, color: L.muted, minWidth: 74, textAlign: "right" }}>
        {d.count > 0 ? `${d.count} here` : "not here yet"}
      </span>
    </button>
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
          ) : list.map((d) => <DriverRow key={d.userId} d={d} onOpen={p.onOpenDriver} />)}
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
