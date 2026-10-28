"use client";
// app/planner/dispatch/SuppliersModal.tsx
//
// The Dispatch Dashboard's supplier screen: the one place to add, edit and
// retire suppliers. Pick a terminal and its suppliers show as a short list
// (name and account number). Tap a row to pick it (when opened to choose one)
// or use the arrow to open it: account number, loading steps with a lock on
// each, notes, and the contract terms. Locked fields can't be changed by
// drivers. Contract limits are warnings only; nothing blocks a load.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PRIMARY_BTN, SECONDARY_BTN } from "@/lib/ui/look";
import { useDashLook } from "../home/dashLook";
import { fieldInput, fieldLabel } from "../components/trip/tripUi";
import { busyProps } from "@/lib/ui/pending";
import { useTerminalSuppliers, linkSupplierToTerminal, type SupplierSteps } from "@/lib/suppliers/useTerminalSuppliers";
import {
  addCompanySupplier, DEFAULT_CONTRACT, renameCompanySupplier, retireCompanySupplier, saveContract, saveSupplierAdmin,
  unlinkSupplier, useCompanySuppliers, useSupplierContracts, type SupplierContract,
} from "@/lib/suppliers/useSupplierAdmin";
import { touchesLocked } from "@/lib/suppliers/locks";
import type { TerminalOption } from "./PlanLoadCard";

const ORANGE = "#fb923c";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="dash-press"
      style={{ border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.2)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.7)",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "6px 9px", cursor: disabled ? "default" : "pointer", opacity: disabled && !on ? 0.5 : 1, flexShrink: 0 }}>
      {children}
    </button>
  );
}

// ── The expanded editor for one supplier at one terminal ────────────────────
function Editor({ name, row, contract, canManage, onSave, onRename, onUnlink, onRetire }: {
  name: string;
  row: SupplierSteps | null;
  contract: SupplierContract | null;
  canManage: boolean;
  onSave: (v: { account: string; accountLocked: boolean; steps: string[]; locks: boolean[]; notes: string }, c: Omit<SupplierContract, "supplier_id" | "terminal_id">) => Promise<string | null>;
  onRename: (n: string) => Promise<string | null>;
  onUnlink: () => Promise<string | null>;
  onRetire: () => Promise<string | null>;
}) {
  const L = useDashLook();
  const [nm, setNm] = useState(name);
  const [account, setAccount] = useState(row?.account_number ?? "");
  const [accountLocked, setAccountLocked] = useState(!!row?.account_locked);
  const [steps, setSteps] = useState<string[]>(row?.steps?.length ? [...row.steps] : [""]);
  const [locks, setLocks] = useState<boolean[]>(row?.steps?.length ? row.step_locks.concat(Array(Math.max(0, row.steps.length - row.step_locks.length)).fill(false)) : [false]);
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [c, setC] = useState<Omit<SupplierContract, "supplier_id" | "terminal_id">>(contract ? { ...contract } : { ...DEFAULT_CONTRACT });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<"unlink" | "retire" | null>(null);

  const accountDisabled = !canManage && accountLocked;
  const run = async (fn: () => Promise<string | null>, ok?: () => void) => {
    setBusy(true); setErr(null); setSaved(false);
    const e = await fn();
    setBusy(false);
    if (e) setErr(e); else ok?.();
  };

  const save = () => {
    if (!canManage) {
      const bad = touchesLocked({ account: row?.account_number ?? null, accountLocked: !!row?.account_locked, steps: row?.steps ?? [], locks: row?.step_locks ?? [] },
        { account: account.trim() || null, steps: steps.map((s) => s.trim()).filter(Boolean) });
      if (bad) { setErr(bad); return; }
    }
    void run(() => onSave({ account, accountLocked, steps, locks, notes }, c), () => setSaved(true));
  };

  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)) || 0);
  const label = (t: string) => <div style={{ ...fieldLabel, marginTop: 14 }}>{t}</div>;

  return (
    <div style={{ borderTop: `1px solid ${L.hairline}`, padding: "12px 12px 14px" }}>
      {canManage && (
        <>
          {label("Supplier name")}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nm} onChange={(e) => setNm(e.target.value)} style={fieldInput} />
            <button type="button" className="dash-press" disabled={busy || nm.trim() === name} onClick={() => run(() => onRename(nm))}
              style={{ ...SECONDARY_BTN, width: 90, padding: "0 10px", fontSize: 12, opacity: nm.trim() === name ? 0.4 : 1 }}>Rename</button>
          </div>
        </>
      )}

      {label("Account number")}
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        <input value={account} onChange={(e) => setAccount(e.target.value)} disabled={accountDisabled} placeholder="Account number"
          style={{ ...fieldInput, opacity: accountDisabled ? 0.55 : 1 }} />
        {canManage ? <Chip on={accountLocked} onClick={() => setAccountLocked((v) => !v)}>{accountLocked ? "Locked" : "Lock"}</Chip>
          : accountLocked ? <span style={{ alignSelf: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: L.muted }}>LOCKED</span> : null}
      </div>
      <div style={{ fontSize: 11, color: L.faint, marginTop: 4 }}>Company only. Never shown to other companies.</div>

      {label("Loading steps")}
      {steps.map((s, i) => {
        const locked = locks[i] === true;
        const disabled = !canManage && locked;
        return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "stretch", marginBottom: 6 }}>
            <span className="dash-num" style={{ width: 18, alignSelf: "center", fontSize: 12, color: L.muted }}>{i + 1}</span>
            <input value={s} disabled={disabled} onChange={(e) => setSteps((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder="e.g. Enter Motiva, then Atlas" style={{ ...fieldInput, opacity: disabled ? 0.55 : 1 }} />
            {canManage ? <Chip on={locked} onClick={() => setLocks((a) => a.map((x, j) => (j === i ? !x : x)))}>{locked ? "Locked" : "Lock"}</Chip>
              : locked ? <span style={{ alignSelf: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: L.muted }}>LOCKED</span> : null}
            {!disabled && (
              <button type="button" aria-label="Remove step" onClick={() => { setSteps((a) => a.filter((_, j) => j !== i)); setLocks((a) => a.filter((_, j) => j !== i)); }}
                style={{ border: "none", background: "transparent", color: L.muted, fontSize: 16, cursor: "pointer", width: 26 }}>×</button>
            )}
          </div>
        );
      })}
      <button type="button" className="dash-press" onClick={() => { setSteps((a) => [...a, ""]); setLocks((a) => [...a, false]); }}
        style={{ ...SECONDARY_BTN, padding: "9px 0", fontSize: 12 }}>+ Add step</button>

      {label("Field notes")}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything drivers should know at this rack"
        style={{ ...fieldInput, resize: "vertical" }} />
      <div style={{ fontSize: 11, color: L.faint, marginTop: 4 }}>Drivers can always edit notes. They can't be locked.</div>

      {label("Contract")}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <Chip on={c.limit_basis === "loads"} disabled={!canManage} onClick={() => setC((x) => ({ ...x, limit_basis: "loads" }))}>By the load</Chip>
        <Chip on={c.limit_basis === "gallons"} disabled={!canManage} onClick={() => setC((x) => ({ ...x, limit_basis: "gallons" }))}>By gallons</Chip>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={fieldLabel}>Per day</div>
          <input inputMode="numeric" disabled={!canManage} value={c.per_day ?? ""} onChange={(e) => setC((x) => ({ ...x, per_day: num(e.target.value) }))}
            placeholder={c.limit_basis === "loads" ? "loads" : "gallons"} style={fieldInput} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={fieldLabel}>Per week</div>
          <input inputMode="numeric" disabled={!canManage} value={c.per_week ?? ""} onChange={(e) => setC((x) => ({ ...x, per_week: num(e.target.value) }))}
            placeholder={c.limit_basis === "loads" ? "loads" : "gallons"} style={fieldInput} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={fieldLabel}>Week resets</div>
          <select disabled={!canManage} value={c.reset_dow} onChange={(e) => setC((x) => ({ ...x, reset_dow: Number(e.target.value) }))} style={fieldInput}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={fieldLabel}>Day resets at</div>
          <input type="time" disabled={!canManage} value={c.reset_time} onChange={(e) => setC((x) => ({ ...x, reset_time: e.target.value || "00:00" }))} style={fieldInput} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: L.faint, marginTop: 4 }}>Limits are warnings only. A load over the limit is never blocked.</div>

      {canManage && (
        <>
          <div style={{ marginTop: 12 }}>
            <Chip on={c.paused} onClick={() => setC((x) => ({ ...x, paused: !x.paused }))}>{c.paused ? "Contract paused" : "Pause contract"}</Chip>
          </div>
          {c.paused && (
            <input value={c.paused_note ?? ""} onChange={(e) => setC((x) => ({ ...x, paused_note: e.target.value }))} placeholder="Why (optional)" style={{ ...fieldInput, marginTop: 8 }} />
          )}
        </>
      )}

      {err && <div style={{ fontSize: 13, color: "#f87171", marginTop: 10 }}>{err}</div>}
      {saved && <div style={{ fontSize: 13, color: "#4ade80", marginTop: 10 }}>Saved.</div>}
      <button type="button" className="dash-press" onClick={save} {...busyProps(busy)} style={{ ...PRIMARY_BTN, marginTop: 12 }}>Save</button>

      <div style={{ marginTop: 12, display: "flex", gap: 14, justifyContent: "center" }}>
        {confirm ? (
          <>
            <span style={{ fontSize: 12, color: L.muted }}>{confirm === "unlink" ? "Remove from this terminal?" : "Deactivate this supplier everywhere?"}</span>
            <button type="button" onClick={() => run(confirm === "unlink" ? onUnlink : onRetire)} style={{ border: "none", background: "transparent", color: "#f87171", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Yes</button>
            <button type="button" onClick={() => setConfirm(null)} style={{ border: "none", background: "transparent", color: L.muted, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>No</button>
          </>
        ) : (
          <>
            {canManage && <button type="button" onClick={() => setConfirm("unlink")} style={{ border: "none", background: "transparent", color: L.muted, fontSize: 12, cursor: "pointer" }}>Remove from this terminal</button>}
            <button type="button" onClick={() => setConfirm("retire")} style={{ border: "none", background: "transparent", color: "#f87171", fontSize: 12, cursor: "pointer" }}>Deactivate supplier</button>
          </>
        )}
      </div>
    </div>
  );
}

export function SuppliersModal(props: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  userId: string;
  canManage: boolean;
  terminals: TerminalOption[];
  initialTerminalId: string | null;
  // When set, tapping a row picks that supplier (warn-only if it's paused).
  onSelect?: (supplierId: string, terminalId: string) => void;
  selectedSupplierId?: string | null;
}) {
  const L = useDashLook();
  const p = props;
  const [terminalId, setTerminalId] = useState<string | null>(p.initialTerminalId);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (p.open) { setTerminalId(p.initialTerminalId); setExpanded(null); setQ(""); setNewName(""); setErr(null); } }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps

  const terminal = p.terminals.find((t) => t.id === terminalId) ?? null;
  const ts = useTerminalSuppliers(p.companyId, terminalId);
  const company = useCompanySuppliers(p.companyId);
  const cons = useSupplierContracts(p.companyId, terminalId);
  const ids = (supplierId: string) => ({ companyId: p.companyId, supplierId, terminalId: terminalId! });
  const refreshAll = () => { ts.refresh(); company.refresh(); cons.refresh(); };

  const linked = useMemo(() => company.suppliers.filter((s) => ts.bySupplier.has(s.supplier_id)), [company.suppliers, ts.bySupplier]);
  const inactiveLinked = useMemo(() => company.all.filter((s) => !s.is_active && ts.bySupplier.has(s.supplier_id)), [company.all, ts.bySupplier]);
  const others = useMemo(() => company.suppliers.filter((s) => !ts.bySupplier.has(s.supplier_id)), [company.suppliers, ts.bySupplier]);
  const termOptions = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? p.terminals.filter((t) => `${t.name} ${t.place ?? ""}`.toLowerCase().includes(s)) : p.terminals;
    return [...list].sort((a, b) => Number(b.used) - Number(a.used) || a.name.localeCompare(b.name)).slice(0, 80);
  }, [p.terminals, q]);

  const add = async () => {
    if (!terminalId) return;
    setBusy(true); setErr(null);
    const r = await addCompanySupplier(p.companyId, p.userId, newName, linked.map((s) => ({ ...s, company_id: p.companyId })) as any);
    if (r.error || !r.supplier) { setBusy(false); setErr(r.error); return; }
    const e = await linkSupplierToTerminal(ids(r.supplier.supplier_id));
    setBusy(false);
    if (e) { setErr(e); return; }
    setNewName(""); refreshAll(); setExpanded(r.supplier.supplier_id);
  };
  const linkExisting = async (supplierId: string) => {
    setBusy(true); setErr(null);
    const e = await linkSupplierToTerminal(ids(supplierId));
    setBusy(false);
    if (e) { setErr(e); return; }
    refreshAll();
    if (p.onSelect) { p.onSelect(supplierId, terminalId!); p.onClose(); } else setExpanded(supplierId);
  };

  const body = !terminalId ? (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminals" style={{ ...fieldInput, marginBottom: 10 }} />
      {termOptions.map((t) => (
        <button key={t.id} type="button" onClick={() => { setTerminalId(t.id); setQ(""); }} className="dash-press"
          style={{ ...L.secondary, boxSizing: "border-box", width: "100%", textAlign: "left", color: "#fff", padding: "10px 12px", marginBottom: 6, cursor: "pointer" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{t.name}</div>
          <div style={{ fontSize: 12, color: L.muted }}>{t.place ?? ""}{t.used ? " · your company loads here" : ""}</div>
        </button>
      ))}
    </>
  ) : (
    <>
      <button type="button" onClick={() => { setTerminalId(null); setExpanded(null); }} className="dash-press"
        style={{ ...L.secondary, boxSizing: "border-box", width: "100%", textAlign: "left", color: "#fff", padding: "10px 12px", marginBottom: 10, cursor: "pointer" }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted }}>Terminal · change</div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{terminal?.name ?? "Terminal"} {terminal?.place && <span style={{ fontWeight: 600, color: L.muted }}>· {terminal.place}</span>}</div>
      </button>
      {err && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 8 }}>{err}</div>}

      {linked.length === 0 && (
        <div style={{ ...L.secondary, padding: "12px 14px", fontSize: 14, color: L.muted, marginBottom: 8 }}>
          No suppliers set up at this terminal yet. Add one below.
        </div>
      )}
      {linked.map((s) => {
        const row = ts.bySupplier.get(s.supplier_id) ?? null;
        const con = cons.contracts.get(s.supplier_id) ?? null;
        const open = expanded === s.supplier_id;
        const anyLock = !!row && (row.account_locked || row.step_locks.some(Boolean));
        const selected = p.selectedSupplierId === s.supplier_id;
        return (
          <div key={s.supplier_id} style={{ ...L.secondary, marginBottom: 6, borderColor: selected ? "#fff" : undefined }}>
            <div style={{ display: "flex", alignItems: "stretch" }}>
              <button type="button" className="dash-press"
                onClick={() => { if (p.onSelect) { p.onSelect(s.supplier_id, terminalId); p.onClose(); } else setExpanded(open ? null : s.supplier_id); }}
                style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", color: "#fff", padding: "11px 12px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  {con?.paused && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: ORANGE }}>PAUSED</span>}
                  {row?.issue_at && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "#f87171" }}>NOT WORKING</span>}
                  {anyLock && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: L.faint }}>LOCKED</span>}
                </div>
                <div className="dash-num" style={{ fontSize: 13, color: row?.account_number ? "rgba(255,255,255,0.85)" : L.faint, marginTop: 2 }}>
                  {row?.account_number ? `Acct ${row.account_number}` : "No account number"}
                </div>
              </button>
              <button type="button" aria-label={open ? "Close details" : "Open details"} onClick={() => setExpanded(open ? null : s.supplier_id)} className="dash-press"
                style={{ width: 48, background: "transparent", border: "none", borderLeft: `1px solid ${L.hairline}`, color: L.muted, fontSize: 16, cursor: "pointer" }}>
                {open ? "▾" : "›"}
              </button>
            </div>
            {open && (
              <Editor key={s.supplier_id} name={s.name} row={row} contract={con} canManage={p.canManage}
                onSave={async (v, c) => {
                  const e1 = await saveSupplierAdmin(ids(s.supplier_id), v, p.userId, p.canManage);
                  if (e1) return e1;
                  const e2 = p.canManage ? await saveContract(ids(s.supplier_id), c, p.userId, !!con?.paused) : null;
                  refreshAll();
                  return e2;
                }}
                onRename={async (n) => { const e = await renameCompanySupplier(s.supplier_id, n); if (!e) refreshAll(); return e; }}
                onUnlink={async () => { const e = await unlinkSupplier(ids(s.supplier_id)); if (!e) { setExpanded(null); refreshAll(); } return e; }}
                onRetire={async () => { const e = await retireCompanySupplier(s.supplier_id); if (!e) { setExpanded(null); refreshAll(); } return e; }} />
            )}
          </div>
        );
      })}

      {inactiveLinked.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: L.muted, margin: "14px 0 6px" }}>Deactivated</div>
          {inactiveLinked.map((s) => (
            <div key={s.supplier_id} style={{ ...L.secondary, display: "flex", alignItems: "center", marginBottom: 6, padding: "10px 12px", opacity: 0.8 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: L.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <button type="button" className="dash-press" {...busyProps(busy)}
                onClick={async () => { setBusy(true); const r = await addCompanySupplier(p.companyId, p.userId, s.name, company.all); setBusy(false); if (r.error) setErr(r.error); else refreshAll(); }}
                style={{ ...SECONDARY_BTN, width: 96, padding: "7px 0", fontSize: 12 }}>Reactivate</button>
            </div>
          ))}
        </>
      )}

      {others.length > 0 && (
        <>
          <button type="button" onClick={() => setShowOthers((v) => !v)} className="dash-press"
            style={{ ...SECONDARY_BTN, marginTop: 8, padding: "10px 0", fontSize: 12 }}>
            {showOthers ? "Hide" : "Show"} other suppliers ({others.length})
          </button>
          {showOthers && others.map((s) => (
            <button key={s.supplier_id} type="button" onClick={() => linkExisting(s.supplier_id)} className="dash-press"
              style={{ ...L.secondary, boxSizing: "border-box", width: "100%", textAlign: "left", color: "rgba(255,255,255,0.8)", padding: "10px 12px", marginTop: 6, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
              {s.name} <span style={{ color: L.faint, fontWeight: 600 }}>· not set up here · tap to add</span>
            </button>
          ))}
        </>
      )}

      {(
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New supplier, exactly as on dispatch (e.g. Atlas - MO)" style={fieldInput} />
          <button type="button" className="dash-press" disabled={busy || !newName.trim()} onClick={add}
            style={{ ...SECONDARY_BTN, width: 80, padding: "0 10px", fontSize: 12, opacity: newName.trim() ? 1 : 0.4 }}>+ Add</button>
        </div>
      )}
    </>
  );

  return (
    <FullscreenModal open={p.open} title={p.onSelect ? "Pick the supplier" : "Suppliers"} onClose={p.onClose}>
      {body}
    </FullscreenModal>
  );
}
