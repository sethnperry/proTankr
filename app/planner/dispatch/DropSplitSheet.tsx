"use client";
// app/planner/dispatch/DropSplitSheet.tsx
//
// A load with more than one drop: pick, for each compartment, which stop it comes off at.
// Compartments left on "Drop 1" are delivered first; the rest stay on the truck for the later stops.
import { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { firstDropComps, splitProblem, type ExtraDrop } from "@/lib/dispatch/drops";

export type SplitComp = { n: number; code: string; color: string };
const pill = (on: boolean) => ({ flex: 1, padding: "9px 4px", borderRadius: 2, cursor: "pointer", fontSize: 13, fontWeight: 800,
  border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.18)"}`, background: on ? "#fff" : "rgba(255,255,255,0.04)", color: on ? "#000" : "#fff" }) as const;

export function DropSplitSheet({ open, comps, drops, onApply, onClose }: {
  open: boolean;
  /** Filled compartments, front (1) first. */
  comps: SplitComp[];
  /** Stops in order: names of drop 1, 2, ... */
  drops: { locationId: string; name: string }[];
  onApply: (extra: ExtraDrop[]) => void; onClose: () => void;
}) {
  const [at, setAt] = useState<Record<number, number>>({}); // comp -> drop index (0 = first)
  const where = (n: number) => at[n] ?? 0;
  const extra: ExtraDrop[] = drops.slice(1).map((d, k) => ({ locationId: d.locationId, comps: comps.filter((c) => where(c.n) === k + 1).map((c) => c.n) }));
  const filled = comps.map((c) => c.n);
  const problem = splitProblem(filled, extra);
  const first = firstDropComps(filled, extra).length;
  return (
    <FullscreenModal open={open} title="Split the load" onClose={onClose}
      footer={<button type="button" disabled={!!problem} onClick={() => onApply(extra)}
        style={{ width: "100%", padding: 14, border: "none", borderRadius: 2, background: "#fff", color: "#000", fontSize: 15, fontWeight: 800, textTransform: "uppercase", opacity: problem ? 0.4 : 1, cursor: problem ? "default" : "pointer" }}>Done</button>}>
      <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginBottom: 12 }}>
        Choose where each compartment comes off. What isn&apos;t delivered at {drops[0]?.name ?? "the first stop"} stays on the truck for the next stop.
      </div>
      {comps.map((c) => (
        <div key={c.n} style={{ marginBottom: 12 }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: c.color, marginRight: 8 }} />Compartment {c.n} · {c.code}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {drops.map((d, k) => <button key={k} type="button" title={d.name} onClick={() => setAt((s) => ({ ...s, [c.n]: k }))} style={pill(where(c.n) === k)}>Drop {k + 1}</button>)}
          </div>
        </div>
      ))}
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
        {drops.map((d, k) => `Drop ${k + 1}: ${d.name}`).join(" · ")}
      </div>
      <div style={{ color: problem ? "#fca5a5" : "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 10, minHeight: 18 }}>{problem ?? `${first} compartment${first === 1 ? "" : "s"} at Drop 1.`}</div>
    </FullscreenModal>
  );
}
