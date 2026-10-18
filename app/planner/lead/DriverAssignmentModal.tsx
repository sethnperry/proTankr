"use client";
// app/planner/lead/DriverAssignmentModal.tsx
//
// Lets a lead assign which company driver is on Day Shift / Night Shift for
// the currently-selected equipment, feeding EquipmentScheduleChart's driver
// name display. Same company-roster fetch pattern as FleetCardsModal.tsx
// (user_companies + get_display_names_full).
//
// No backing table exists for this yet -- same "mock data first" call
// already made for the rest of the schedule chart. The assignment lives in
// LeadPage's own React state (passed in/out via props here) and is lost on
// reload; a real driver_shift_assignment-style table is a later piece once
// this interaction is validated.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Driver = { user_id: string; display_name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  dayDriverName: string;
  nightDriverName: string;
  onAssign: (dayDriverName: string, nightDriverName: string) => void;
};

const INPUT: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 14, padding: "9px 12px", boxSizing: "border-box" as const, width: "100%",
};

function RoleField({ label, color, value, onChange, drivers }: { label: string; color: string; value: string; onChange: (v: string) => void; drivers: Driver[] }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color, marginBottom: 6 }}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={INPUT}>
        {!drivers.some((d) => d.display_name === value) && value && (
          <option value={value}>{value}</option>
        )}
        {drivers.map((d) => (
          <option key={d.user_id} value={d.display_name}>{d.display_name}</option>
        ))}
      </select>
    </div>
  );
}

export default function DriverAssignmentModal({ open, onClose, companyId, dayDriverName, nightDriverName, onAssign }: Props) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState(dayDriverName);
  const [night, setNight] = useState(nightDriverName);

  useEffect(() => {
    if (!open) return;
    setDay(dayDriverName);
    setNight(nightDriverName);
  }, [open, dayDriverName, nightDriverName]);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: memberRows } = await supabase.from("user_companies").select("user_id").eq("company_id", companyId);
      const memberIds = (memberRows ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (memberIds.length === 0) { setDrivers([]); setLoading(false); return; }
      const { data: nameRows } = await supabase.rpc("get_display_names_full", { p_user_ids: memberIds });
      if (cancelled) return;
      const list = ((nameRows ?? []) as any[])
        .map((r) => ({ user_id: r.user_id, display_name: r.display_name ?? "Unknown" }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
      setDrivers(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, companyId]);

  function handleSave() {
    onAssign(day, night);
    onClose();
  }

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10200, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#111518", borderRadius: 2, border: "1px solid rgba(255,255,255,0.1)", width: "100%", maxWidth: 420, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 18px 12px", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: "rgba(255,255,255,0.92)" }}>Driver Assignment</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 18px" }}>
          {loading ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
          ) : (
            <>
              <RoleField label="DAY SHIFT" color="#facc15" value={day} onChange={setDay} drivers={drivers} />
              <RoleField label="NIGHT SHIFT" color="#60a5fa" value={night} onChange={setNight} drivers={drivers} />
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px 16px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button type="button" onClick={handleSave} disabled={loading}
            style={{ width: "100%", padding: "11px 0", borderRadius: 2, border: "none", background: "rgba(74,222,128,0.15)", color: "#4ade80", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
