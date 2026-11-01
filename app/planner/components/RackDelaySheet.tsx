"use client";
// app/planner/components/RackDelaySheet.tsx
//
// Plan Review: "Rack Delay". The driver is at the rack and something is holding the truck up: pick why. The
// reason starts the same running delay timer the Delay button on the Driver Dashboard uses (logged to the trip
// when it ends) and warns other drivers headed here: Long Line and Rack Down for the whole terminal, Allocation
// and Out of Product for the products picked. Stays in Plan Review afterward.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TerminalIssueCode } from "@/lib/trips/terminalIssues";

export type RackDelayProduct = { productId: string; name: string };

const REASONS: { code: TerminalIssueCode; label: string; scoped: boolean }[] = [
  { code: "long_line", label: "Long Line", scoped: false },
  { code: "rack_down", label: "Rack Down", scoped: false },
  { code: "out_of_allocation", label: "Allocation", scoped: true },
  { code: "out_of_product", label: "Terminal Out Of Product", scoped: true },
  { code: "terminal_issue", label: "Other Terminal Issues", scoped: false },
];

const HAIR = "rgba(255,255,255,0.12)";
const row: React.CSSProperties = { display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "15px 14px", border: "none", borderTop: `1px solid ${HAIR}`, background: "#0f0f10", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" };

export default function RackDelaySheet({ open, products, onClose, onSubmit }: {
  open: boolean;
  /** The products on this load (for Allocation and Out of Product). */
  products: RackDelayProduct[];
  onClose: () => void;
  /** Starts the delay and posts the warning. Resolves with an error message, or null. */
  onSubmit: (code: TerminalIssueCode, productIds: string[]) => Promise<string | null>;
}) {
  const [step, setStep] = useState<"reasons" | "products">("reasons");
  const [code, setCode] = useState<TerminalIssueCode | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setStep("reasons"); setCode(null); setPicked(new Set()); setBusy(false); setErr(null); };
  const close = () => { reset(); onClose(); };

  const submit = async (c: TerminalIssueCode, ids: string[]) => {
    setBusy(true); setErr(null);
    const e = await onSubmit(c, ids);
    setBusy(false);
    if (e) { setErr(e); return; }
    close();
  };
  const choose = (r: (typeof REASONS)[number]) => {
    setCode(r.code);
    if (!r.scoped) return void submit(r.code, []);
    if (products.length <= 1) return void submit(r.code, products.map((p) => p.productId));
    setPicked(new Set(products.map((p) => p.productId)));
    setStep("products");
  };

  return (
    <FullscreenModal open={open} title="Rack Delay" onClose={close} footer={null}>
      {step === "reasons" ? (
        <>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>What is holding you up? A timer starts and other drivers headed here are warned.</div>
          <div style={{ border: `1px solid ${HAIR}`, borderTop: "none" }}>
            {REASONS.map((r) => (
              <button key={r.code} type="button" disabled={busy} aria-busy={busy && code === r.code} onClick={() => choose(r)} style={{ ...row, opacity: busy ? 0.55 : 1 }}>
                <span style={{ flex: 1 }}>{r.label}</span><span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>Which products?</div>
          <div style={{ border: `1px solid ${HAIR}`, borderTop: "none" }}>
            {products.map((p) => {
              const on = picked.has(p.productId);
              return (
                <button key={p.productId} type="button" onClick={() => setPicked((s) => { const n = new Set(s); n.has(p.productId) ? n.delete(p.productId) : n.add(p.productId); return n; })} style={row}>
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <span aria-hidden style={{ width: 18, height: 18, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.3)"}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#00c2ff", fontWeight: 900 }}>{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <button type="button" disabled={busy || picked.size === 0} aria-busy={busy} onClick={() => code && void submit(code, [...picked])}
            style={{ width: "100%", marginTop: 12, padding: "15px 0", border: "none", background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", opacity: busy || picked.size === 0 ? 0.5 : 1 }}>Start Delay</button>
          <button type="button" onClick={() => setStep("reasons")} style={{ width: "100%", marginTop: 8, padding: "12px 0", border: "none", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>‹ Back</button>
        </>
      )}
      {err && <div style={{ marginTop: 12, color: "#f87171", fontSize: 14 }}>{err}</div>}
    </FullscreenModal>
  );
}
