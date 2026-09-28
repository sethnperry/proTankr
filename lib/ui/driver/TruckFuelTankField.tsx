"use client";
// lib/ui/driver/TruckFuelTankField.tsx
//
// Saddle-tank size (all tanks combined) for one truck. Used by the Load
// Report's fuel-burn correction; editable here so a driver or admin can fix
// it without waiting for an over-weight load. Shared by the Binder (Edit from
// the equipment modal) and the admin Edit Truck modal.
//
// Self-contained: fetches and saves trucks.fuel_tank_gallons itself, on its
// own query, so a missing column (migration not applied yet) only hides this
// field -- it never breaks the host modal's own truck query or save. Any role
// may edit it (the status-only trigger allow-lists this column for drivers).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" };
const inputStyle: React.CSSProperties = {
  width: "100%", borderRadius: 6, padding: "9px 40px 9px 11px", border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 14, boxSizing: "border-box",
};

export default function TruckFuelTankField({ truckId }: { truckId: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailable(null); setErr(null);
    (async () => {
      const { data, error } = await supabase.from("trucks").select("fuel_tank_gallons").eq("truck_id", truckId).maybeSingle();
      if (cancelled) return;
      if (error) { setAvailable(false); return; }
      const v = Number((data as any)?.fuel_tank_gallons);
      const n = Number.isFinite(v) && v > 0 ? v : null;
      setSaved(n);
      setValue(n != null ? String(n) : "");
      setAvailable(true);
    })();
    return () => { cancelled = true; };
  }, [truckId]);

  if (!available) return null;

  const num = value.trim() === "" ? null : Number(value);
  const valid = num === null || (Number.isFinite(num) && num > 0);
  const dirty = valid && num !== saved;

  async function save() {
    if (!dirty) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from("trucks").update({ fuel_tank_gallons: num }).eq("truck_id", truckId).select("truck_id");
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (!data || data.length === 0) { setErr("You don't have permission to edit this truck."); return; }
    setSaved(num);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label style={labelStyle}>Fuel tank size (all tanks)</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            placeholder="e.g. 200"
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
            onFocus={(e) => e.target.select()}
            style={inputStyle}
          />
          <span style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>gal</span>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            style={{
              padding: "9px 14px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.20)",
              background: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {err && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
        Used to correct an over-weight load for fuel burned since your tare.
      </div>
    </div>
  );
}
