"use client";
// app/planner/components/equipment/TarePairHost.tsx
//
// The tracker showed this driver in a truck with a trailer the app has never paired with it. No pairing can exist
// without a tare, so the server notified them and this window waits on the dashboard: enter the tare from a scale
// ticket and the pair is made (the same New Pairing question the equipment picker asks).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type Pending = { handoff_id: string; truck_id: string; trailer_id: string };
const HAIR = "rgba(255,255,255,0.16)";

export function TarePairHost({ userId, onPaired }: { userId: string | null; onPaired: (comboId: string | null) => void }) {
  const [p, setP] = useState<Pending | null>(null);
  const [names, setNames] = useState<{ truck: string; trailer: string } | null>(null);
  const [tare, setTare] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [later, setLater] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.from("equipment_handoffs").select("handoff_id, truck_id, trailer_id").eq("user_id", userId).eq("needs_tare", true).is("resolved_at", null).is("ended_at", null).order("detected_at", { ascending: false }).limit(1).maybeSingle();
        if (!alive || !data) return;
        const row = data as Pending;
        setP(row);
        const [t, r] = await Promise.all([
          supabase.from("trucks").select("truck_name").eq("truck_id", row.truck_id).maybeSingle(),
          supabase.from("trailers").select("trailer_name").eq("trailer_id", row.trailer_id).maybeSingle(),
        ]);
        if (alive) setNames({ truck: (t.data as any)?.truck_name ?? "truck", trailer: (r.data as any)?.trailer_name ?? "trailer" });
      } catch { /* no window */ }
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!p || later === p.handoff_id) return null;
  const n = Number(tare.replace(/,/g, ""));
  const ok = Number.isFinite(n) && n > 0;
  const save = async () => {
    if (!ok) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc("couple_combo", { p_truck_id: p.truck_id, p_trailer_id: p.trailer_id, p_tare_lbs: n, p_force: true });
    if (error) { setErr(error.message); setBusy(false); return; }
    await supabase.from("equipment_handoffs").update({ needs_tare: false }).eq("handoff_id", p.handoff_id);
    onPaired(typeof data === "string" ? data : null);
    setP(null);
  };
  return (
    <FullscreenModal open title="New Pairing" onClose={() => setLater(p.handoff_id)} footer={null}>
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ fontSize: 15, lineHeight: 1.5 }}>
          The tracker shows you signed in to <b>{names?.truck ?? "…"}</b> with <b>{names?.trailer ?? "…"}</b>. They haven't been paired before. Enter the tare weight from a certified scale ticket.
        </div>
        <input type="number" inputMode="numeric" placeholder="e.g. 34800" autoFocus value={tare} onChange={(e) => setTare(e.target.value)}
          style={{ width: "100%", marginTop: 14, padding: "12px 14px", border: `1px solid ${HAIR}`, background: "rgba(0,0,0,0.28)", color: "#fff", fontSize: 18, fontWeight: 700, boxSizing: "border-box", borderRadius: 2 }} />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{err}</div>}
        <button type="button" disabled={!ok || busy} aria-busy={busy} onClick={() => void save()}
          style={{ width: "100%", marginTop: 12, padding: "15px 0", fontSize: 15, fontWeight: 800, border: "none", background: "#fff", color: "#000", cursor: "pointer", borderRadius: 2, opacity: !ok || busy ? 0.5 : 1 }}>
          Pair them
        </button>
        <button type="button" onClick={() => setLater(p.handoff_id)}
          style={{ width: "100%", marginTop: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, border: `1px solid ${HAIR}`, background: "transparent", color: "#fff", cursor: "pointer", borderRadius: 2 }}>
          Not now
        </button>
      </div>
    </FullscreenModal>
  );
}
