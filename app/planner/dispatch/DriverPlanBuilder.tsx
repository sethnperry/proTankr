"use client";
// app/planner/dispatch/DriverPlanBuilder.tsx
//
// The shared Plan Builder (PlanWizard), run by dispatch for a driver. Saves into the driver's
// own plan slots and trailer caps, so these are that driver's personal settings: every change
// that overwrites something of theirs asks first.
import { useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import PlanWizard from "../components/PlanWizard";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { nextFreeSlot, SLOTS } from "@/lib/dispatch/driverPlans";
import { saveDriverPlan, saveTrailerCaps, type PlanComp } from "@/lib/dispatch/driverPlansIO";
import type { PresetSummary } from "@/lib/trips/tripPlan";
import type { CompPlanInput } from "../types";

const btn = (primary?: boolean) => ({ flex: 1, padding: "12px", borderRadius: 2, cursor: "pointer", fontSize: 14, fontWeight: 800,
  border: primary ? "none" : "1px solid rgba(255,255,255,0.18)", background: primary ? "#ef4444" : "rgba(255,255,255,0.04)", color: "#fff" }) as const;

export function DriverPlanBuilder({ open, slot, driverId, driverName, comboId, trailerId, comps, presets, raw, onSaved, onClose }: {
  open: boolean;
  /** The slot being edited, or null for a new plan. */
  slot: number | null;
  driverId: string; driverName: string; comboId: string | null; trailerId: string | null;
  comps: PlanComp[]; presets: PresetSummary[]; raw: Record<number, any>;
  onSaved: (slot: number) => void; onClose: () => void;
}) {
  const products = useProductsCatalog().data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ text: string; yes: () => void } | null>(null);
  const capAsk = useRef<((ok: boolean) => void) | null>(null);
  const target = slot ?? nextFreeSlot(presets) ?? SLOTS[SLOTS.length - 1];
  const replacing = presets.some((p) => p.slot === target);
  const letter = (s: number) => "ABCDE"[s - 1] ?? String(s);
  const first = driverName.split(" ")[0] || "the driver";

  // Changing a cap changes the trailer's setting for the driver too.
  const saveCaps = (changes: Record<number, number>) => new Promise<void>((resolve, reject) => {
    capAsk.current = (ok) => {
      if (!ok) { reject(new Error("Cap not changed.")); return; }
      void saveTrailerCaps(trailerId ?? "", changes).then((e) => (e ? reject(new Error(e)) : resolve()));
    };
    setAsk({ text: `A compartment cap is ${first}'s personal setting for this trailer. Change it?`, yes: () => capAsk.current?.(true) });
  });

  const write = async (plan: Record<number, CompPlanInput>) => {
    if (!comboId) { setError("This truck and trailer pairing isn't set up yet."); return; }
    setBusy(true);
    const err = await saveDriverPlan(driverId, comboId, target, plan as any, raw[target]);
    setBusy(false);
    if (err) { setError(err); return; }
    onSaved(target);
  };
  const finish = (plan: Record<number, CompPlanInput>) => {
    if (!replacing) { void write(plan); return; }
    setAsk({ text: `Plan ${letter(target)} is ${first}'s saved plan. Replace it with this one?`, yes: () => void write(plan) });
  };

  return (
    <>
      <PlanWizard open={open} mode="new" compartments={comps} products={products} canSetCap busy={busy}
        replacingLetter={replacing && slot == null ? letter(target) : null}
        onSaveCaps={saveCaps} onFinish={finish} onCancel={onClose} />
      <FullscreenModal open={!!ask || !!error} title={ask ? "Driver's personal setting" : "Not saved"}
        onClose={() => { if (ask) capAsk.current?.(false); capAsk.current = null; setAsk(null); setError(null); }}>
        <div style={{ color: "#fff", fontSize: 15, lineHeight: 1.45, marginBottom: 14 }}>{ask ? ask.text : error}</div>
        {ask ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={btn()} onClick={() => { capAsk.current?.(false); capAsk.current = null; setAsk(null); }}>Cancel</button>
            <button type="button" style={btn(true)} onClick={() => { const a = ask; setAsk(null); a.yes(); }}>Yes, change it</button>
          </div>
        ) : <button type="button" style={btn()} onClick={() => setError(null)}>OK</button>}
      </FullscreenModal>
    </>
  );
}
