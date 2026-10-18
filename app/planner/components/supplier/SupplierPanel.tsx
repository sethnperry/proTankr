"use client";
// app/planner/components/supplier/SupplierPanel.tsx
//
// The Planner's supplier card: which supplier from dispatch each planned
// product is pulling from at this terminal, that supplier's loading steps
// (numbered screens + notes, company-only), the terminal's shared note, and
// Switch Supplier (no allocation / account didn't work / other).
//
// Picks live on the phone for the current visit (lib/suppliers/picks.ts).
// Steps and the note live on the server (lib/suppliers/useTerminalSuppliers).
// A pick links the supplier to the terminal so it shows first next time.
// "No allocation" posts a company-only allocation report naming the supplier
// ("No Allocation - Atlas - MO (D2)"); "Account didn't work" flags the steps
// so the next driver sees them as suspect until someone edits them or a load
// finishes on that supplier here.

import React, { useEffect, useMemo, useState } from "react";
import { SupplierPicker, type PickedSupplier } from "../trip/SupplierPicker";
import type { SupplierRow } from "@/lib/trips/types";
import { ANY_PRODUCT, applyPick, groupPicks, type SupplierPick } from "@/lib/suppliers/picks";
import {
  useTerminalSuppliers, linkSupplierToTerminal, saveSupplierSteps, reportSupplierIssue, saveTerminalNote,
  type SupplierSteps,
} from "@/lib/suppliers/useTerminalSuppliers";
import { looksLikeAccountNumber } from "@/lib/suppliers/noteGuard";
import { submitOutageReport } from "../../hooks/useTerminalOutageReports";

export type PanelProduct = { id: string; code: string; color: string };

export type SupplierSwitchEvent = {
  from: string;
  to: string;
  reason: SwitchReason;
  note: string;
  productIds: string[];
};

type SwitchReason = "no_allocation" | "account" | "other";
const REASONS: { code: SwitchReason; label: string }[] = [
  { code: "no_allocation", label: "No allocation" },
  { code: "account", label: "Account didn't work" },
  { code: "other", label: "Other" },
];

const MUTED = "rgba(255,255,255,0.55)";
const AMBER = "#fbbf24";

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function SupplierPanel({
  userId, companyId, terminalId, terminalName, rackId, truckLabel,
  products, picks, onPicks, suppliers, onAddSupplier,
  promptToken, onPromptDone, onSkip, onSwitched,
}: {
  userId: string | null;
  companyId: string | null;
  terminalId: string | null;
  terminalName: string | null;
  rackId: string | null;
  truckLabel: string;
  products: PanelProduct[];
  picks: SupplierPick[];
  onPicks: (next: SupplierPick[]) => void;
  suppliers: SupplierRow[];
  onAddSupplier: (name: string) => SupplierRow | null;
  /** Bump to open the "supplier from dispatch" picker. */
  promptToken: number;
  /** Called after the prompt is answered (picked or skipped). */
  onPromptDone?: () => void;
  onSkip: () => void;
  onSwitched?: (e: SupplierSwitchEvent) => void;
}) {
  const data = useTerminalSuppliers(companyId, terminalId);
  // Nothing planned yet: the pick is for any product (inherited later).
  const productIds = useMemo(() => (products.length ? products.map((p) => p.id) : [ANY_PRODUCT]), [products]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groups = useMemo(() => groupPicks(picks), [picks]);
  const terminalSupplierIds = useMemo(() => new Set(data.bySupplier.keys()), [data.bySupplier]);

  // Picker: for every product (prompt / "pick"), or a subset (tap a product).
  const [picker, setPicker] = useState<{ productIds?: string[]; prompt?: boolean; switchFrom?: SwitchState } | null>(null);
  const [editSteps, setEditSteps] = useState<{ supplier_id: string; name: string } | null>(null);
  const [editNote, setEditNote] = useState(false);
  const [switching, setSwitching] = useState<{ supplier_id: string | null; name: string; productIds: string[] } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  useEffect(() => {
    if (promptToken > 0) setPicker({ prompt: true });
  }, [promptToken]);

  const pick = (s: PickedSupplier, ids?: string[]) => {
    onPicks(applyPick(picks, productIds, s, ids));
    if (s.supplier_id && companyId && terminalId) {
      void linkSupplierToTerminal({ companyId, supplierId: s.supplier_id, terminalId }).then(() => data.refresh());
    }
  };

  const onPickerPick = async (s: PickedSupplier) => {
    const cur = picker;
    setPicker(null);
    if (cur?.switchFrom) {
      await finishSwitch(cur.switchFrom, s);
    } else {
      pick(s, cur?.productIds);
    }
    if (cur?.prompt) onPromptDone?.();
  };

  const finishSwitch = async (sw: SwitchState, to: PickedSupplier) => {
    setBusyError(null);
    if (sw.reason === "no_allocation" && companyId && terminalId && userId) {
      const { error } = await submitOutageReport({
        terminalId, selectedRackId: rackId, productIds: sw.productIds, reportType: "out_of_allocation",
        companyId, userId, truckLabel, supplier: { supplier_id: sw.from.supplier_id, name: sw.from.name },
      });
      if (error) setBusyError(`Couldn't post the allocation report: ${error}`);
    }
    if (sw.reason === "account" && sw.from.supplier_id && companyId && terminalId && userId) {
      const err = await reportSupplierIssue({ companyId, supplierId: sw.from.supplier_id, terminalId }, sw.note || "Account didn't work", userId);
      if (err) setBusyError(`Couldn't flag the steps: ${err}`);
    }
    pick(to, sw.productIds);
    onSwitched?.({ from: sw.from.name, to: to.name, reason: sw.reason, note: sw.note, productIds: sw.productIds });
    data.refresh();
  };

  if (!terminalId) return null;

  const note = data.terminalNote;
  const pickerCurrent = picker?.productIds?.length === 1
    ? (picks.find((p) => p.product_id === picker.productIds![0])?.name ?? null)
    : (groups.length === 1 ? groups[0].name : null);

  return (
    <div style={{ marginTop: 6, marginBottom: 12, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "10px 12px", background: "rgba(255,255,255,0.02)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button type="button" onClick={() => setCollapsed((v) => !v)}
          style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: MUTED, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase" }}>
          {collapsed ? "▸" : "▾"} Supplier
        </button>
        {groups.length > 0 && (
          <button type="button" onClick={() => setPicker({})}
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: MUTED, fontSize: 12, fontWeight: 700 }}>
            Change all ›
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <button type="button" onClick={() => setPicker({})}
          style={{ marginTop: 8, width: "100%", textAlign: "left", padding: "12px", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.35)", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
          <span>Supplier from dispatch?</span><span style={{ color: MUTED }}>Pick ›</span>
        </button>
      ) : groups.map((g) => {
        const steps = g.supplier_id ? data.bySupplier.get(g.supplier_id) ?? null : null;
        return (
          <SupplierGroup key={g.supplier_id ?? g.name}
            name={g.name}
            products={g.productIds.map((id) => productById.get(id)!).filter(Boolean)}
            steps={steps}
            names={data.names}
            collapsed={collapsed}
            canEdit={!!g.supplier_id}
            onProduct={(pid) => setPicker({ productIds: [pid] })}
            onEdit={() => g.supplier_id && setEditSteps({ supplier_id: g.supplier_id, name: g.name })}
            onSwitch={() => setSwitching({ supplier_id: g.supplier_id, name: g.name, productIds: g.productIds })}
          />
        );
      })}

      {products.some((p) => !picks.find((x) => x.product_id === p.id)) && groups.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 13, color: MUTED }}>
          No supplier for{" "}
          {products.filter((p) => !picks.find((x) => x.product_id === p.id)).map((p) => (
            <button key={p.id} type="button" onClick={() => setPicker({ productIds: [p.id] })}
              style={{ border: "none", background: "transparent", color: "#fff", fontWeight: 700, cursor: "pointer", padding: "0 4px" }}>
              {p.code} ›
            </button>
          ))}
        </div>
      )}

      {!collapsed && (
        <button type="button" onClick={() => setEditNote(true)}
          style={{ marginTop: 10, width: "100%", textAlign: "left", border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", background: "transparent", padding: "8px 0 0", cursor: "pointer", color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED }}>
            <span>Terminal note · all companies</span><span>{note?.note ? "Edit ›" : "+ Add ›"}</span>
          </div>
          {note?.note && <div style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>{note.note}</div>}
        </button>
      )}

      {busyError && <div style={{ marginTop: 8, fontSize: 13, color: "#f87171" }}>{busyError}</div>}

      <SupplierPicker
        open={!!picker}
        title={picker?.switchFrom ? "Switch to which supplier?" : picker?.prompt ? "Supplier from dispatch" : "Supplier"}
        subtitle={picker?.productIds
          ? `For ${picker.productIds.map((id) => productById.get(id)?.code ?? "").join(", ")} at ${terminalName || "this terminal"}`
          : products.length !== 1 ? `For every product at ${terminalName || "this terminal"}. You can change one product after.` : undefined}
        suppliers={suppliers}
        current={pickerCurrent}
        onAdd={onAddSupplier}
        terminalSupplierIds={terminalSupplierIds}
        terminalName={terminalName}
        excludeName={picker?.switchFrom?.from.name ?? null}
        onPick={(s) => { void onPickerPick(s); }}
        onClose={() => { const p = picker; setPicker(null); if (p?.prompt) onPromptDone?.(); }}
        onSkip={picker?.prompt ? () => { setPicker(null); onSkip(); onPromptDone?.(); } : undefined}
      />

      {switching && (
        <SwitchSheet
          from={switching}
          products={switching.productIds.map((id) => productById.get(id)!).filter(Boolean)}
          onClose={() => setSwitching(null)}
          onNext={(sw) => { setSwitching(null); setPicker({ switchFrom: sw, productIds: sw.productIds.filter((id) => id !== ANY_PRODUCT).length ? sw.productIds : undefined }); }}
        />
      )}

      {editSteps && companyId && terminalId && userId && (
        <StepsEditor
          supplierName={editSteps.name}
          terminalName={terminalName}
          initial={data.bySupplier.get(editSteps.supplier_id) ?? null}
          onClose={() => setEditSteps(null)}
          onSave={async (steps, notes) => {
            const err = await saveSupplierSteps({ companyId, supplierId: editSteps.supplier_id, terminalId }, steps, notes, userId);
            if (!err) { data.refresh(); setEditSteps(null); }
            return err;
          }}
        />
      )}

      {editNote && terminalId && userId && (
        <TerminalNoteEditor
          terminalName={terminalName}
          initial={note?.note ?? ""}
          onClose={() => setEditNote(false)}
          onSave={async (text) => {
            const err = await saveTerminalNote(terminalId, text, userId);
            if (!err) { data.refresh(); setEditNote(false); }
            return err;
          }}
        />
      )}
    </div>
  );
}

type SwitchState = {
  from: { supplier_id: string | null; name: string };
  reason: SwitchReason;
  note: string;
  productIds: string[];
};

function SupplierGroup({
  name, products, steps, names, collapsed, canEdit, onProduct, onEdit, onSwitch,
}: {
  name: string;
  products: PanelProduct[];
  steps: SupplierSteps | null;
  names: Record<string, string>;
  collapsed: boolean;
  canEdit: boolean;
  onProduct: (pid: string) => void;
  onEdit: () => void;
  onSwitch: () => void;
}) {
  const list = steps?.steps ?? [];
  const meta: string[] = [];
  if (steps?.steps_updated_at) meta.push(`Updated ${shortDate(steps.steps_updated_at)}${steps.updated_by && names[steps.updated_by] ? ` by ${names[steps.updated_by]}` : ""}`);
  if (steps?.last_loaded_at) meta.push(`Loaded ${shortDate(steps.last_loaded_at)}`);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{name}</span>
          {products.map((p) => (
            <button key={p.id} type="button" onClick={() => onProduct(p.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, background: "transparent", color: "#fff", fontSize: 12, fontWeight: 700, padding: "2px 8px", cursor: "pointer" }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color }} />{p.code}
            </button>
          ))}
        </div>
        <button type="button" onClick={onSwitch}
          style={{ flexShrink: 0, border: "1px solid rgba(255,255,255,0.25)", borderRadius: 2, background: "transparent", color: "#fff", fontSize: 13, fontWeight: 700, padding: "6px 10px", cursor: "pointer" }}>
          Switch
        </button>
      </div>

      {steps?.issue_at && (
        <div style={{ marginTop: 6, fontSize: 13, color: AMBER }}>
          ⚠ Reported not working {shortDate(steps.issue_at)}{steps.issue_by && names[steps.issue_by] ? ` by ${names[steps.issue_by]}` : ""}
          {steps.issue_note ? `: ${steps.issue_note}` : ""}
        </div>
      )}

      {!collapsed && (
        <div style={{ marginTop: 6 }}>
          {list.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {list.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 8, color: "#fff", fontSize: 15, lineHeight: 1.45 }}>
                  <span style={{ width: 18, flexShrink: 0, textAlign: "right", color: MUTED, fontWeight: 800 }}>{i + 1}</span>
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{s}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: MUTED }}>No steps yet for {name} here.</div>
          )}
          {steps?.notes && <div style={{ marginTop: 6, fontSize: 14, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap" }}>{steps.notes}</div>}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: MUTED }}>{meta.join(" · ")}</span>
            {canEdit && (
              <button type="button" onClick={onEdit}
                style={{ flexShrink: 0, border: "none", background: "transparent", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                {list.length || steps?.notes ? "Edit steps ›" : "+ Add steps ›"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────────────

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 16px 16px" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto", background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{title}</div>
          <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: MUTED, fontSize: 14, cursor: "pointer" }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)",
  padding: "10px 12px", fontSize: 16, color: "#fff", boxSizing: "border-box",
};
const primaryBtn: React.CSSProperties = {
  width: "100%", marginTop: 12, padding: "12px", borderRadius: 2, border: "none", background: "#fff", color: "#000",
  fontSize: 16, fontWeight: 800, cursor: "pointer",
};

function SwitchSheet({
  from, products, onClose, onNext,
}: {
  from: { supplier_id: string | null; name: string; productIds: string[] };
  products: PanelProduct[];
  onClose: () => void;
  onNext: (sw: SwitchState) => void;
}) {
  const [reason, setReason] = useState<SwitchReason | null>(null);
  const [note, setNote] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(from.productIds));
  const ok = !!reason && chosen.size > 0 && (reason !== "other" || note.trim().length > 0);
  return (
    <Sheet title={`Switch from ${from.name}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>What happened?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {REASONS.map((r) => (
          <button key={r.code} type="button" onClick={() => setReason(r.code)}
            style={{ textAlign: "left", padding: "12px", borderRadius: 2, border: `1px solid ${reason === r.code ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.12)"}`, background: reason === r.code ? "rgba(255,255,255,0.08)" : "transparent", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            {r.label}
          </button>
        ))}
      </div>
      {reason === "no_allocation" && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
          Your company's drivers headed here will see “No Allocation - {from.name}”.
        </div>
      )}
      {reason === "account" && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
          The steps for {from.name} here get marked as not working until someone updates them or loads on it.
        </div>
      )}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder={reason === "other" ? "What happened? (required)" : "Note (optional)"}
        style={{ ...inputStyle, marginTop: 10, resize: "vertical" }} />
      {products.length > 1 && (
        <>
          <div style={{ fontSize: 13, color: MUTED, margin: "10px 0 6px" }}>Which products?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {products.map((p) => {
              const on = chosen.has(p.id);
              return (
                <button key={p.id} type="button"
                  onClick={() => setChosen((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 2, border: `1px solid ${on ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.15)"}`, background: on ? "rgba(255,255,255,0.08)" : "transparent", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: p.color }} />{p.code}{on ? " ✓" : ""}
                </button>
              );
            })}
          </div>
        </>
      )}
      <button type="button" disabled={!ok} onClick={() => reason && onNext({ from: { supplier_id: from.supplier_id, name: from.name }, reason, note: note.trim(), productIds: [...chosen] })}
        style={{ ...primaryBtn, opacity: ok ? 1 : 0.5, cursor: ok ? "pointer" : "not-allowed" }}>
        Pick New Supplier
      </button>
    </Sheet>
  );
}

function StepsEditor({
  supplierName, terminalName, initial, onClose, onSave,
}: {
  supplierName: string;
  terminalName: string | null;
  initial: SupplierSteps | null;
  onClose: () => void;
  onSave: (steps: string[], notes: string) => Promise<string | null>;
}) {
  const [steps, setSteps] = useState<string[]>(() => (initial?.steps?.length ? [...initial.steps] : [""]));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet title={`${supplierName} at ${terminalName || "this terminal"}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: "#86efac", marginBottom: 10 }}>
        🔒 Your company only. Account numbers go here.
      </div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Each screen on the loading computer, in order</div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span style={{ width: 22, textAlign: "right", color: MUTED, fontSize: 14, flexShrink: 0 }}>{i + 1}</span>
          <input value={s} onChange={(e) => setSteps((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={i === 0 ? "e.g. Motiva — 123456" : i === 1 ? "e.g. Atlas — 789012" : "e.g. Load # 2001462 (leave off last digit)"}
            style={inputStyle} />
          <button type="button" aria-label="Remove step" onClick={() => setSteps((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : [""]))}
            style={{ flexShrink: 0, border: "none", background: "transparent", color: MUTED, fontSize: 18, cursor: "pointer", padding: "0 4px" }}>×</button>
        </div>
      ))}
      <button type="button" onClick={() => setSteps((a) => [...a, ""])}
        style={{ border: "1px dashed rgba(255,255,255,0.3)", borderRadius: 2, background: "transparent", color: "#fff", fontSize: 14, fontWeight: 700, padding: "8px 12px", cursor: "pointer", marginTop: 2 }}>
        + Add screen
      </button>
      <div style={{ fontSize: 13, color: MUTED, margin: "12px 0 6px" }}>Notes (anything that doesn't fit a step)</div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      {error && <div style={{ marginTop: 8, fontSize: 13, color: "#f87171" }}>{error}</div>}
      <button aria-busy={!!(busy)} type="button" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        const err = await onSave(steps, notes);
        setBusy(false);
        if (err) setError(err);
      }} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : "Save Steps"}
      </button>
    </Sheet>
  );
}

function TerminalNoteEditor({
  terminalName, initial, onClose, onSave,
}: {
  terminalName: string | null;
  initial: string;
  onClose: () => void;
  onSave: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = looksLikeAccountNumber(text);
  return (
    <Sheet title={`${terminalName || "Terminal"} note`} onClose={onClose}>
      <div style={{ fontSize: 13, color: AMBER, marginBottom: 10 }}>
        Shared with every company. Don't put account numbers, PINs or codes here. Those go in the supplier steps, which only your company sees.
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} autoFocus
        placeholder="e.g. New screens since October. Gas on lanes 1-3, diesel lane 4."
        style={{ ...inputStyle, resize: "vertical" }} />
      {blocked && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#f87171" }}>
          That looks like an account number or code. Put it in the supplier steps (company only).
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 13, color: "#f87171" }}>{error}</div>}
      <button aria-busy={!!(busy)} type="button" disabled={busy || blocked} onClick={async () => {
        setBusy(true); setError(null);
        const err = await onSave(text);
        setBusy(false);
        if (err) setError(err);
      }} style={{ ...primaryBtn, opacity: busy || blocked ? 0.5 : 1, cursor: busy || blocked ? "not-allowed" : "pointer" }}>
        {busy ? "Saving…" : "Save Note"}
      </button>
    </Sheet>
  );
}
