"use client";
// app/planner/components/trip/NoLoadSheet.tsx
//
// Couldn't load here (rack hop). The driver picks what stopped them from the
// shared terminal-issue list (lib/trips/terminalIssues.ts), which also warns
// other drivers headed to that terminal, and confirms when they got there and
// when they left. The times and reason go on the PTD for billing.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { isTerminalIssueCode, OTHER_NO_LOAD_REASONS, TERMINAL_ISSUES } from "@/lib/trips/terminalIssues";
import { fieldInput, fieldLabel, fromLocalInput, muted, primaryBtn, sectionCard, sectionTitle, toLocalInput } from "./tripUi";

export type NoLoadSubmit = {
  reason: string; // TerminalIssueCode, "load_changed" or "other"
  productIds: string[]; // for Out of Product / Out of Allocation
  note: string | null;
  arrivedAt: string;
  leftAt: string;
};

const chip = (on: boolean): React.CSSProperties => ({
  padding: "10px 14px", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.8)",
});

export function NoLoadSheet({ open, rackName, arrivedAt, products, busy, error, onSubmit, onClose }: {
  open: boolean;
  rackName: string;
  arrivedAt: string | null;
  products: { productId: string; name: string }[]; // the planned products
  busy: boolean;
  error: string | null;
  onSubmit: (v: NoLoadSubmit) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [arrived, setArrived] = useState("");
  const [left, setLeft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const now = new Date().toISOString();
    setReason(null);
    setPicked(new Set(products.length === 1 ? [products[0].productId] : []));
    setNote("");
    setArrived(toLocalInput(arrivedAt ?? now));
    setLeft(toLocalInput(now));
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scoped = useMemo(() => TERMINAL_ISSUES.find((t) => t.code === reason)?.productScoped ?? false, [reason]);

  const submit = () => {
    if (!reason) return setErr("Pick what stopped you.");
    if (scoped && picked.size === 0) return setErr("Pick the product.");
    if (reason === "other" && !note.trim()) return setErr("Add a short note.");
    const a = fromLocalInput(arrived), l = fromLocalInput(left);
    if (!a || !l) return setErr("Enter both times.");
    if (Date.parse(l) < Date.parse(a)) return setErr("Depart can't be before Arrive.");
    onSubmit({ reason, productIds: scoped ? [...picked] : [], note: note.trim() || null, arrivedAt: a, leftAt: l });
  };

  return (
    <FullscreenModal open={open} title={`Couldn't Load at ${rackName}`} onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={sectionTitle}>What stopped you?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TERMINAL_ISSUES.map((t) => (
            <button key={t.code} type="button" style={chip(reason === t.code)} onClick={() => setReason(t.code)}>{t.label}</button>
          ))}
          {OTHER_NO_LOAD_REASONS.map((r) => (
            <button key={r.code} type="button" style={chip(reason === r.code)} onClick={() => setReason(r.code)}>{r.label}</button>
          ))}
        </div>
        {scoped && products.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={fieldLabel}>Which product</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {products.map((p) => {
                const on = picked.has(p.productId);
                return (
                  <button key={p.productId} type="button" style={chip(on)}
                    onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(p.productId); else n.add(p.productId); return n; })}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {isTerminalIssueCode(reason) && (
          <div style={{ fontSize: 12, color: muted, marginTop: 12 }}>
            {reason === "out_of_allocation" ? "Your company's drivers" : "Other drivers"} headed to {rackName} will see this.
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <div style={fieldLabel}>Note{reason === "other" ? "" : " (optional)"}</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" style={fieldInput} />
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Times at {rackName}</div>
        <div style={fieldLabel}>Arrive</div>
        <input type="datetime-local" value={arrived} onChange={(e) => setArrived(e.target.value)} style={{ ...fieldInput, marginBottom: 10 }} />
        <div style={fieldLabel}>Depart</div>
        <input type="datetime-local" value={left} onChange={(e) => setLeft(e.target.value)} style={fieldInput} />
      </div>

      {(err || error) && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err || error}</div>}
      <button type="button" onClick={submit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : "Depart for the Next Rack"}
      </button>
    </FullscreenModal>
  );
}
