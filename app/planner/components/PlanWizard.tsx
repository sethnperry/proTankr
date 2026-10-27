"use client";
// app/planner/components/PlanWizard.tsx
//
// Plan Builder: the walk-through that creates a plan for a trailer. One
// product window per compartment (the shared CompartmentModal, with search),
// then a summary. Needs no terminal, so the product list is the whole
// catalog and the search box narrows it as the driver types ("die" -> every
// diesel product).
//
//  - Products picked earlier float to the top, right under "Leave empty", so
//    a trailer that is all ULSD #2 is one tap per compartment.
//  - Staff roles (admin / lead / dispatch) can also set each compartment's
//    safety cap here; drivers get the cap the trailer already has.
//  - At least one compartment must hold a product before it can finish.
//  - mode "first": there is no plan yet for this trailer, so it cannot be
//    dismissed. mode "new": the driver asked for another plan and can cancel.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import CompartmentModal from "../modals/CompartmentModal";
import { productColorFor } from "../utils/productColor";
import type { CompPlanInput } from "../types";

type CompLite = { comp_number: number | string; max_gallons: number | null; cap_gallons: number | null };

const secondaryBtn: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 2, cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700,
};
const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "14px", borderRadius: 2, cursor: "pointer", border: "none",
  background: "#fff", color: "#000", fontSize: 15, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: "0.06em",
};

export default function PlanWizard({
  open, mode, compartments, products, canSetCap, replacingLetter, busy, onSaveCaps, onFinish, onCancel,
}: {
  open: boolean;
  mode: "first" | "new";
  compartments: CompLite[];
  products: any[];
  canSetCap: boolean;
  /** Set when every plan slot is full and the new plan will replace this one. */
  replacingLetter?: string | null;
  busy?: boolean;
  onSaveCaps: (changes: Record<number, number>) => Promise<void>;
  onFinish: (compPlan: Record<number, CompPlanInput>) => void;
  onCancel?: () => void;
}) {
  const comps = useMemo(
    () => [...compartments].map((c) => ({ n: Number(c.comp_number), max: Number(c.max_gallons ?? 0), cap: c.cap_gallons != null ? Number(c.cap_gallons) : Number(c.max_gallons ?? 0) }))
      .filter((c) => Number.isFinite(c.n)).sort((a, b) => a.n - b.n),
    [compartments],
  );
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<Record<number, CompPlanInput>>({});
  // The everyday fuels first, so a new driver isn't scrolling past additives and aviation gas.
  const [pinned, setPinned] = useState<string[]>([]);
  const commonIds = useMemo(() => ["D2", "87", "89", "93", "DYED"]
    .map((code) => products.find((p) => String(p.button_code ?? "").toUpperCase() === code)?.product_id).filter(Boolean) as string[], [products]);
  const [capText, setCapText] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fromSummary, setFromSummary] = useState(false);

  // Reset whenever the wizard is (re)opened.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) { setStep(0); setPlan({}); setPinned([]); setCapText({}); setError(null); setFromSummary(false); }
    wasOpen.current = open;
  }, [open]);

  const byId = useMemo(() => new Map<string, any>(products.map((p) => [p.product_id, p])), [products]);
  const total = comps.length;
  if (!open || total === 0) return null;

  const capFor = (n: number) => {
    const c = comps.find((x) => x.n === n)!;
    const raw = capText[n];
    if (raw == null || raw === "") return c.cap;
    const v = Math.round(Number(raw));
    return Number.isFinite(v) ? Math.max(1, Math.min(c.max, v)) : c.cap;
  };

  const picked = comps.filter((c) => plan[c.n] && !plan[c.n].empty && plan[c.n].productId);
  const summary = step >= total;

  const finish = async () => {
    if (picked.length === 0) { setError("Pick a product for at least one compartment."); return; }
    setError(null);
    if (canSetCap) {
      const changes: Record<number, number> = {};
      for (const c of comps) { const v = capFor(c.n); if (v !== c.cap) changes[c.n] = v; }
      if (Object.keys(changes).length) {
        try { await onSaveCaps(changes); } catch (e: any) { setError(e?.message ?? "Could not save the cap."); return; }
      }
    }
    // Fill in explicit empties so the plan always covers every compartment.
    const full: Record<number, CompPlanInput> = {};
    for (const c of comps) full[c.n] = plan[c.n] ?? { empty: true, productId: "" };
    onFinish(full);
  };

  if (!summary) {
    const c = comps[step];
    const backBtn = step > 0 || mode === "new" ? (
      <button type="button" style={secondaryBtn} onClick={() => { if (fromSummary) { setFromSummary(false); setStep(total); } else if (step > 0) setStep(step - 1); else onCancel?.(); }}>
        {step > 0 ? "‹ Back" : "Cancel"}
      </button>
    ) : null;
    return (
      <CompartmentModal
        open
        compNumber={c.n}
        compartments={compartments as any[]}
        compPlan={plan}
        terminalProducts={products}
        styles={{}}
        setCompPlan={(fn: any) => setPlan((prev) => (typeof fn === "function" ? fn(prev) : fn))}
        onClose={() => { if (step > 0) setStep(step - 1); else if (mode === "new") onCancel?.(); }}
        hideCloseButton
        searchable
        autoFocusSearch
        pinnedProductIds={[...pinned, ...commonIds.filter((x) => !pinned.includes(x))]}
        title={`Plan Builder · ${step + 1} of ${total}`}
        footer={backBtn}
        onPicked={(id) => {
          if (id) setPinned((prev) => [id, ...prev.filter((x) => x !== id)]);
          setError(null);
          setStep(fromSummary ? total : step + 1);
          setFromSummary(false);
        }}
        extra={(
          <>
            {step === 0 && mode === "first" && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
                A plan is what goes in each compartment. Build the one you load most; it becomes your default, and you can make up to five.
              </div>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.35 }}>
              Pick a product to load in Comp {c.n} for this plan.
            </div>
            {canSetCap && (
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2 }}>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                  Cap for Comp {c.n} <span style={{ opacity: 0.6 }}>(max {c.max.toLocaleString()} gal)</span>
                </span>
                <input
                  inputMode="numeric"
                  value={capText[c.n] ?? String(c.cap)}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setCapText((prev) => ({ ...prev, [c.n]: e.target.value.replace(/[^0-9]/g, "") }))}
                  style={{ width: 90, textAlign: "right", padding: "6px 8px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 15, fontWeight: 700 }}
                />
              </label>
            )}
          </>
        )}
      />
    );
  }

  return (
    <FullscreenModal
      open
      title="Plan Builder"
      onClose={() => setStep(total - 1)}
      hideCloseButton
      footer={(
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => void finish()}>
            {busy ? "Saving…" : mode === "first" ? "Open Planner" : "Save Plan"}
          </button>
          <button type="button" style={secondaryBtn} onClick={() => setStep(total - 1)}>‹ Back</button>
        </div>
      )}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
          {mode === "first" ? "This is your default plan." : "Your new plan."}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.45 }}>
          {mode === "first"
            ? "It loads whenever you haven't picked a plan. You can change any compartment from the Planner."
            : replacingLetter ? `All plan slots are full, so this replaces Plan ${replacingLetter}.` : "It goes in the next empty plan slot."}
        </div>
        <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
          {comps.map((c) => {
            const sel = plan[c.n];
            const p = sel && !sel.empty && sel.productId ? byId.get(sel.productId) : null;
            const color = p ? (String(p.hex_code ?? "").trim() || productColorFor(p.product_name ?? "")) : "rgba(255,255,255,0.25)";
            return (
              <button key={c.n} type="button" onClick={() => { setFromSummary(true); setStep(comps.findIndex((x) => x.n === c.n)); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 28, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>C{c.n}</span>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: p ? 1 : 0.5 }}>
                  {p ? (p.display_name || p.product_name) : "Empty"}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{capFor(c.n).toLocaleString()} gal</span>
              </button>
            );
          })}
        </div>
        {error && <div style={{ color: "#fca5a5", fontSize: 13, fontWeight: 700 }}>{error}</div>}
      </div>
    </FullscreenModal>
  );
}
