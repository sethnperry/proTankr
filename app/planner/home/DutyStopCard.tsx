"use client";
// app/planner/home/DutyStopCard.tsx
//
// "Your log changed at 10:42" -- asked after the fact, from Geotab's own
// timestamp, so nothing is typed and a stop in a dead zone still gets its real
// time once the truck's logs reach us.

import React, { useEffect, useRef, useState } from "react";
import { DELAY_REASONS, LEG_LABEL, OTHER_CODE, type DelayLeg } from "@/lib/trips/delays";
import { DUTY_NAME } from "@/lib/trips/stopPrompt";
import { OTHER_NO_LOAD_REASONS, TERMINAL_ISSUES } from "@/lib/trips/terminalIssues";
import { LOOK } from "./dashLook";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function DutyStopCard({ stop, targetName, leg, hop, products = [], onArrived, onHop, onDelay, onDismiss, preset, presetReason, reportPosted }: {
  stop: { at: string; code: string; resumedAt: string | null }; targetName: string; leg: DelayLeg;
  /** Set when the driver was at a rack and has driven elsewhere: the rack they left. */
  hop?: { rackName: string } | null;
  /** Products on the plan, for a product-specific report (out of product / allocation). */
  products?: { productId: string; name: string }[];
  /** Answer already tapped on the notification: applied here, and only the reason is asked. */
  preset?: "arrived" | "delay" | "yes" | "no";
  /** A "No" whose reason was already picked on the notification (and the report posted there). */
  presetReason?: string | null; reportPosted?: boolean;
  onArrived: () => void; onHop?: (reason: string, productIds: string[], reported?: boolean) => void; onDelay: (code: string, note: string | null) => void; onDismiss: () => void;
}) {
  const [picking, setPicking] = useState(preset === "delay");
  const [why, setWhy] = useState(preset === "no" && !!hop);
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    if (preset === "arrived") { applied.current = true; onArrived(); }
    else if (preset === "yes") { applied.current = true; onDismiss(); }
    else if (preset === "no" && hop && presetReason && presetReason !== "other") {
      applied.current = true;
      const issue = TERMINAL_ISSUES.find((t) => t.code === presetReason);
      if (reportPosted || !issue?.productScoped) onHop?.(presetReason, [], !!reportPosted);
      else if (products.length > 1) { setScoped(presetReason); setSel(new Set()); }
      else onHop?.(presetReason, products.map((x) => x.productId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const [scoped, setScoped] = useState<string | null>(null); // a product-specific reason waiting on which products
  const [sel, setSel] = useState<Set<string>>(new Set());
  const btn: React.CSSProperties = { padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 2 };
  return (
    <div style={{ ...LOOK.primary, padding: 14, marginBottom: 10, borderColor: "rgba(147,197,253,0.5)" }}>
      {preset && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "rgba(147,197,253,0.9)", marginBottom: 4 }}>You answered from the notification</div>}
      <div style={{ fontSize: 14, fontWeight: 800 }}>{hop ? `You stopped driving at ${hm(stop.at)}` : `Did you arrive at ${targetName}?`}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
        Your log changed to {DUTY_NAME[stop.code] ?? stop.code}{stop.resumedAt ? ` and you were driving again at ${hm(stop.resumedAt)}` : ""}. {hop ? `You left ${hop.rackName}. Another rack, or a delay?` : `Your truck stopped at ${hm(stop.at)}.`}
      </div>
      {scoped ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Which product(s)? Only tick what was really unavailable.</div>
          {products.map((p) => (
            <button key={p.productId} type="button" className="dash-press" onClick={() => setSel((c) => { const n = new Set(c); if (n.has(p.productId)) n.delete(p.productId); else n.add(p.productId); return n; })}
              style={{ ...btn, width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6, borderColor: sel.has(p.productId) ? "rgba(74,222,128,0.7)" : undefined }}>
              {sel.has(p.productId) ? "✓ " : ""}{p.name}
            </button>
          ))}
          <button type="button" disabled={sel.size === 0} className="dash-press" onClick={() => onHop?.(scoped, [...sel])} style={{ width: "100%", padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: sel.size ? 1 : 0.5, ...LOOK.cta }}>Continue</button>
        </div>
      ) : why ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Why did you leave {hop?.rackName}?</div>
          {[...TERMINAL_ISSUES, ...OTHER_NO_LOAD_REASONS].map((r) => (
            <button key={r.code} type="button" className="dash-press" style={{ ...btn, width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6 }}
              onClick={() => {
                const issue = TERMINAL_ISSUES.find((t) => t.code === r.code);
                if (issue?.productScoped && products.length > 1) { setScoped(r.code); setSel(new Set()); return; }
                onHop?.(r.code, issue?.productScoped ? products.map((x) => x.productId) : []);
              }}>{r.label}</button>
          ))}
          <button type="button" onClick={() => setWhy(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer", padding: 0 }}>‹ Back</button>
        </div>
      ) : !picking ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="dash-press" onClick={hop ? () => setWhy(true) : onArrived} style={{ flex: 2, padding: "11px 0", fontSize: 14, fontWeight: 800, cursor: "pointer", ...LOOK.cta }}>{hop ? `Another rack · ${hm(stop.at)}` : `Yes · ${hm(stop.at)}`}</button>
          {hop ? (<>
            <button type="button" className="dash-press" onClick={() => setPicking(true)} style={{ ...btn, flex: 1 }}>A delay</button>
            <button type="button" onClick={onDismiss} style={{ ...btn, flex: 1 }}>Neither</button>
          </>) : (
            <button type="button" className="dash-press" onClick={() => setPicking(true)} style={{ ...btn, flex: 1 }}>No</button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>Not there yet. {LEG_LABEL[leg]} · what held you up?</div>
          {[...DELAY_REASONS[leg], { code: OTHER_CODE, label: "Other" }].map((r) => (
            <button key={r.code} type="button" className="dash-press" onClick={() => onDelay(r.code, null)} style={{ ...btn, width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6 }}>{r.label}</button>
          ))}
          {!hop && <button type="button" className="dash-press" onClick={onDismiss} style={{ ...btn, width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6 }}>Nothing, just a stop</button>}
          <button type="button" onClick={() => setPicking(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer", padding: 0 }}>‹ Back</button>
        </div>
      )}
    </div>
  );
}
