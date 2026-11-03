"use client";
// lib/ui/driver/TruckSleeperField.tsx
//
// Sleeper cab yes/no for one truck. At End shift a sleeper is asked whether the driver is staying in it; a day cab
// isn't. Self-contained like TruckFuelTankField: fetches and saves trucks.has_sleeper itself, so a missing column
// only hides the field. Staff edit it (drivers see it read only).

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function TruckSleeperField({ truckId, canEdit }: { truckId: string; canEdit: boolean }) {
  const [value, setValue] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    void supabase.from("trucks").select("has_sleeper").eq("truck_id", truckId).maybeSingle().then(({ data, error }) => { if (!off && !error) setValue(!!(data as any)?.has_sleeper); });
    return () => { off = true; };
  }, [truckId]);
  if (value == null) return null;
  const set = async (v: boolean) => {
    setErr(null);
    const { data, error } = await supabase.from("trucks").update({ has_sleeper: v }).eq("truck_id", truckId).select("truck_id");
    if (error || !data?.length) { setErr(error?.message ?? "You don't have permission to edit this truck."); return; }
    setValue(v);
  };
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 4, display: "block" }}>Cab</label>
      <div style={{ display: "flex", gap: 6 }}>
        {([[false, "Day cab"], [true, "Sleeper"]] as const).map(([v, label]) => (
          <button key={label} type="button" disabled={!canEdit} onClick={() => void set(v)}
            style={{ flex: 1, padding: "9px 0", borderRadius: 2, fontSize: 13, fontWeight: 800, cursor: canEdit ? "pointer" : "default", border: `1px solid ${value === v ? "#fff" : "rgba(255,255,255,0.16)"}`, background: value === v ? "#fff" : "transparent", color: value === v ? "#000" : "#fff", opacity: canEdit || value === v ? 1 : 0.5 }}>
            {label}
          </button>
        ))}
      </div>
      {err && <div style={{ color: "#fca5a5", fontSize: 12, marginTop: 6 }}>{err}</div>}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>A sleeper is asked at End shift whether you're staying in it.</div>
    </div>
  );
}
