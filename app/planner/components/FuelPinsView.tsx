"use client";
// app/planner/components/FuelPinsView.tsx
//
// Settings → Fuel PINs. The driver's PIN for each RFID / company-account fuel
// method, edited without starting a fuel stop. Same driver_fuel_pins rows the
// fuel screen reads; own rows only (RLS), so admins can't see them.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useFuelSetup } from "@/lib/fuel/useFuelSetup";
import { isQuickKind, KIND_LABEL } from "@/lib/fuel/types";

const muted = "rgba(255,255,255,0.5)";
const input: React.CSSProperties = { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" };

export default function FuelPinsView({ companyId, userId }: { companyId: string; userId: string }) {
  const { methods, loading } = useFuelSetup(companyId);
  const mine = methods.filter((m) => m.is_active && isQuickKind(m.kind));
  const [pins, setPins] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!userId) return;
    void supabase.from("driver_fuel_pins").select("method_id,pin").eq("user_id", userId).then(({ data }) => {
      const p = Object.fromEntries(((data ?? []) as { method_id: string; pin: string }[]).map((r) => [r.method_id, r.pin]));
      setPins(p); setDraft(p);
    });
  }, [userId]);

  const save = async (id: string) => {
    const pin = (draft[id] ?? "").trim();
    setBusy(id); setMsg(null);
    const { error } = pin
      ? await supabase.from("driver_fuel_pins").upsert({ user_id: userId, method_id: id, pin, updated_at: new Date().toISOString() })
      : await supabase.from("driver_fuel_pins").delete().eq("user_id", userId).eq("method_id", id);
    setBusy(null);
    if (error) return setMsg({ id, ok: false, text: error.message });
    setPins((x) => { const n = { ...x }; if (pin) n[id] = pin; else delete n[id]; return n; });
    setMsg({ id, ok: true, text: pin ? "Saved." : "Removed." });
  };

  if (loading && !methods.length) return <div style={{ color: muted, fontSize: 14 }}>Loading…</div>;
  if (!mine.length) return <div style={{ color: muted, fontSize: 14, lineHeight: 1.5 }}>Your company hasn't set up an RFID or company-account fuel program, so there's no PIN to keep here.</div>;

  return (
    <div>
      <div style={{ color: muted, fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
        Only you can see these. They fill in on the fuel screen so you don't have to type them at the pump.
      </div>
      {mine.map((m) => {
        const changed = (draft[m.id] ?? "").trim() !== (pins[m.id] ?? "");
        return (
          <div key={m.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{m.name} <span style={{ color: muted, fontWeight: 500 }}>· {KIND_LABEL[m.kind]}</span></div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={input} inputMode="numeric" autoComplete="off" placeholder="PIN" value={draft[m.id] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))} />
              <button type="button" style={{ ...btn, opacity: changed ? 1 : 0.4 }} disabled={!changed || busy === m.id} aria-busy={busy === m.id} onClick={() => void save(m.id)}>Save</button>
            </div>
            {msg?.id === m.id && <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</div>}
          </div>
        );
      })}
    </div>
  );
}
