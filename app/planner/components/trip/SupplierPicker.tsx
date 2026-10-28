"use client";
// app/planner/components/trip/SupplierPicker.tsx
//
// Pick the supplier from the company's list instead of typing it, so the same
// supplier is always spelled the same way. "+ Add" saves a new one; a name
// already on the list (ignoring case and spaces) just picks the existing one.
//
// At a terminal (terminalSupplierIds given), only the suppliers loaded at that terminal are
// listed. A supplier new to the terminal is added with "+ New supplier" (an existing company
// supplier with the same name is reused). Names are typed exactly as they appear on dispatch.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cleanName, findSupplier, searchSuppliers } from "@/lib/trips/refs";
import type { SupplierRow } from "@/lib/trips/types";

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", padding: "4px 2px 6px" };

export type PickedSupplier = { supplier_id: string | null; name: string };

export function SupplierPicker({
  open, suppliers, current, onAdd, onPick, onClose,
  title = "Supplier", subtitle, terminalSupplierIds, terminalName, onSkip, excludeName,
}: {
  open: boolean;
  suppliers: SupplierRow[];
  current: string | null;
  onAdd: (name: string) => SupplierRow | null;
  onPick: (s: PickedSupplier) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  terminalSupplierIds?: Set<string>;
  terminalName?: string | null;
  onSkip?: () => void;
  /** Left off the list (switching away from this supplier). */
  excludeName?: string | null;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setQ(""); }, [open]);
  const active = useMemo(
    () => suppliers.filter((s) => s.is_active && (!excludeName || s.name !== excludeName)),
    [suppliers, excludeName],
  );
  // At a terminal: only what is loaded there.
  const pool = useMemo(() => (terminalSupplierIds ? active.filter((s) => terminalSupplierIds.has(s.supplier_id)) : active), [active, terminalSupplierIds]);
  const list = useMemo(() => searchSuppliers(pool, q), [pool, q]);
  const typed = cleanName(q);
  const exact = typed ? findSupplier(suppliers, typed) : null;

  if (!open) return null;
  const row = (s: SupplierRow) => {
    const on = current != null && s.name === current;
    return (
      <button key={s.supplier_id} type="button" onClick={() => onPick({ supplier_id: s.supplier_id, name: s.name })}
        style={{ width: "100%", textAlign: "left", padding: "12px", marginBottom: 6, borderRadius: 2, border: `1px solid ${on ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.1)"}`, background: on ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", color: "#fff", fontSize: 15, cursor: "pointer" }}>
        {s.name}
      </button>
    );
  };
  const add = () => {
    const row = onAdd(typed);
    onPick(row ? { supplier_id: row.supplier_id, name: row.name } : { supplier_id: null, name: typed });
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 16px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 14 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{title}</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 14, cursor: "pointer" }}>Close</button>
        </div>
        {subtitle && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: -4, marginBottom: 10 }}>{subtitle}</div>}
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search, or type it exactly as on dispatch"
          style={{ width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", padding: "12px", fontSize: 16, color: "#fff", boxSizing: "border-box", marginBottom: 10 }}
        />
        <div style={{ overflowY: "auto", flex: 1 }}>
          {typed && !exact ? (
            <button type="button" onClick={add}
              style={{ width: "100%", textAlign: "left", padding: "12px", marginBottom: 6, borderRadius: 2, border: "1px dashed rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + New supplier “{typed}”
            </button>
          ) : (
            <button type="button" onClick={() => inputRef.current?.focus()}
              style={{ width: "100%", textAlign: "left", padding: "12px", marginBottom: 6, borderRadius: 2, border: "1px dashed rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + New supplier
            </button>
          )}
          {list.length > 0 && terminalSupplierIds && <div style={sectionLabel}>At {terminalName || "this terminal"}</div>}
          {list.map((s) => row(s))}
          {!list.length && !typed && (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", padding: 8 }}>{terminalSupplierIds ? "No suppliers loaded here yet. " : "No suppliers yet. "}Type the name exactly as on dispatch to add it.</div>
          )}
        </div>
        {onSkip && (
          <button type="button" onClick={onSkip}
            style={{ marginTop: 10, border: "none", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 14, cursor: "pointer", padding: 8 }}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
