"use client";
// app/planner/components/trip/SupplierPicker.tsx
//
// Pick the supplier from the company's list instead of typing it, so the same
// supplier is always spelled the same way. "+ Add" saves a new one; a name
// already on the list (ignoring case and spaces) just picks the existing one.
//
// At a terminal (terminalSupplierIds given), only the suppliers loaded at that terminal are
// listed. A supplier new to the terminal is added with "+ New supplier". Suppliers are per terminal:
// the same name at another terminal is a different supplier. Names are typed exactly as on dispatch.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { cleanName, findSupplier, searchSuppliers } from "@/lib/trips/refs";
import type { SupplierRow } from "@/lib/trips/types";
import { saveSupplierAccount, useTerminalSuppliers } from "@/lib/suppliers/useTerminalSuppliers";

const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", padding: "4px 2px 6px" };

export type PickedSupplier = { supplier_id: string | null; name: string };

export function SupplierPicker({
  open, suppliers, current, onAdd, onPick, onClose,
  title = "Supplier", subtitle, terminalSupplierIds, terminalName, onSkip, excludeName, companyId, terminalId,
}: {
  open: boolean;
  suppliers: SupplierRow[];
  current: string | null;
  /** Adds a supplier. `atTerminal` is the list a name is matched against (this terminal's suppliers). */
  onAdd: (name: string, atTerminal?: SupplierRow[]) => SupplierRow | null;
  onPick: (s: PickedSupplier) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  terminalSupplierIds?: Set<string>;
  terminalName?: string | null;
  onSkip?: () => void;
  /** Left off the list (switching away from this supplier). */
  excludeName?: string | null;
  /** With both, a new supplier is asked for its account number(s), saved for this terminal (company only). */
  companyId?: string | null;
  terminalId?: string | null;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Without a list passed in, a terminal given by id supplies its own.
  const own = useTerminalSuppliers(companyId ?? null, terminalId ?? null);
  const hereIds = useMemo(() => terminalSupplierIds ?? (companyId && terminalId ? new Set(own.bySupplier.keys()) : undefined), [terminalSupplierIds, companyId, terminalId, own.bySupplier]);
  const [naming, setNaming] = useState<string | null>(null); // a new supplier waiting for its account number(s)
  const [account, setAccount] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setQ(""); setNaming(null); setAccount(""); } }, [open]);
  const asksAccount = !!companyId && !!terminalId;
  const active = useMemo(
    () => suppliers.filter((s) => s.is_active && (!excludeName || s.name !== excludeName)),
    [suppliers, excludeName],
  );
  // At a terminal: only what is loaded there.
  const pool = useMemo(() => (hereIds ? active.filter((s) => hereIds.has(s.supplier_id)) : active), [active, hereIds]);
  const list = useMemo(() => searchSuppliers(pool, q), [pool, q]);
  const typed = cleanName(q);
  const exact = typed ? findSupplier(hereIds ? pool : suppliers, typed) : null;

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
  const finishAdd = async (name: string, acct: string) => {
    // Names are per terminal: only a supplier already loaded here is reused.
    const row = onAdd(name, hereIds ? pool : undefined);
    if (row && asksAccount && acct.trim()) {
      setSaving(true);
      await saveSupplierAccount({ companyId: companyId!, supplierId: row.supplier_id, terminalId: terminalId! }, acct);
      setSaving(false);
      own.refresh();
    }
    onPick(row ? { supplier_id: row.supplier_id, name: row.name } : { supplier_id: null, name });
  };
  const add = () => {
    // A name the company already has is just picked; only a truly new supplier asks for its account.
    if (asksAccount) setNaming(typed); else void finishAdd(typed, "");
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
        {naming == null && <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search, or type it exactly as on dispatch"
          style={{ width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", padding: "12px", fontSize: 16, color: "#fff", boxSizing: "border-box", marginBottom: 10 }}
        />}
        {naming != null ? (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{naming}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 10, lineHeight: 1.4 }}>
              Account number(s) for this supplier at {terminalName || "this terminal"}. More than one: separate with commas. Saved for your company only.
            </div>
            <input autoFocus value={account} onChange={(e) => setAccount(e.target.value)} inputMode="text" placeholder="Account number(s)"
              style={{ width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)", padding: "12px", fontSize: 16, color: "#fff", boxSizing: "border-box", marginBottom: 10 }} />
            <button type="button" disabled={saving} aria-busy={saving} onClick={() => void finishAdd(naming, account)}
              style={{ width: "100%", padding: "14px 0", border: "none", borderRadius: 2, background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase", cursor: "pointer" }}>
              {account.trim() ? "Add supplier" : "Add without account number"}
            </button>
            <button type="button" onClick={() => setNaming(null)}
              style={{ marginTop: 8, border: "none", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 14, cursor: "pointer", padding: 8 }}>Back</button>
          </div>
        ) : (
        <div style={{ overflowY: "auto", flex: 1 }}>
          {typed && !exact ? (
            <button type="button" onClick={add}
              style={{ width: "100%", textAlign: "left", padding: "12px", marginBottom: 6, borderRadius: 2, border: "1px dashed rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + New supplier “{typed}”
            </button>
          ) : !typed && (
            <button type="button" onClick={() => inputRef.current?.focus()}
              style={{ width: "100%", textAlign: "left", padding: "12px", marginBottom: 6, borderRadius: 2, border: "1px dashed rgba(255,255,255,0.3)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              + New supplier
            </button>
          )}
          {list.length > 0 && hereIds && <div style={sectionLabel}>At {terminalName || "this terminal"}</div>}
          {list.map((s) => row(s))}
          {!list.length && !typed && (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", padding: 8 }}>{hereIds ? "No suppliers loaded here yet. " : "No suppliers yet. "}Type the name exactly as on dispatch to add it.</div>
          )}
        </div>
        )}
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
