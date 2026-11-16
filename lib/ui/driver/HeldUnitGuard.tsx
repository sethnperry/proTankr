"use client";
// lib/ui/driver/HeldUnitGuard.tsx — a themed "this unit is in use" confirmation for staff changing equipment.
// guard() resolves true at once when nobody else holds the unit (or the caller isn't staff); otherwise it asks, and
// resolves true only if they go ahead. A blocked change (blockMessage) resolves false after telling them why.
import React, { useCallback, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { heldWarning, unitHolderInfo, type HeldUnit } from "@/lib/equipment/adminNotice";

type Ask = { text: string; blocked: boolean };

export function useHeldUnitGuard() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  /** `what` says what is about to happen. `block` stops the change when the holder is on an open trip. */
  const guard = useCallback(async (units: { kind: "truck" | "trailer"; id: string; name: string }[], what: string, block?: string): Promise<{ ok: boolean; held: HeldUnit[] }> => {
    const held: HeldUnit[] = [];
    for (const u of units) { const info = await unitHolderInfo(u.kind, u.id); if (info.holderId) held.push({ ...u, info }); }
    if (held.length === 0) return { ok: true, held };
    const blocked = !!block && held.some((h) => h.info.openTrip);
    const text = blocked ? `${heldWarning(held, "").split(". They'll")[0]}. ${block}` : heldWarning(held, what);
    const ok = await new Promise<boolean>((resolve) => { resolver.current = resolve; setAsk({ text, blocked }); });
    return { ok: ok && !blocked, held };
  }, []);

  const finish = (ok: boolean) => { setAsk(null); resolver.current?.(ok); resolver.current = null; };
  const node = (
    <FullscreenModal open={!!ask} onClose={() => finish(false)} title={ask?.blocked ? "Can't change this now" : "Unit in use"} footer={null}>
      <div style={{ fontSize: 15, lineHeight: 1.5 }}>{ask?.text}</div>
      {ask?.blocked ? (
        <button type="button" onClick={() => finish(false)} style={{ display: "block", width: "100%", marginTop: 16, padding: "14px 18px", border: "none", borderRadius: 2, background: "#fff", color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>OK</button>
      ) : (
        <>
          <button type="button" onClick={() => finish(true)} style={{ display: "block", width: "100%", marginTop: 16, padding: "14px 18px", border: "none", borderRadius: 2, background: "#fff", color: "#000", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>Change it and notify them</button>
          <button type="button" onClick={() => finish(false)} style={{ display: "block", width: "100%", marginTop: 10, padding: "14px 18px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.06)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>Cancel</button>
        </>
      )}
    </FullscreenModal>
  );
  return { guard, node };
}
