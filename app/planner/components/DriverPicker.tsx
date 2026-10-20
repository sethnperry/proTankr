"use client";
// app/planner/components/DriverPicker.tsx
//
// Search-and-pick a company roster member -- the Dispatch tab's own
// driver picker (dispatcher picking who to view). Built on
// useCompanyRoster (originally the third call site for that fetch shape,
// alongside Driver Training's trainee picker before that feature was
// removed 2026-08-31 -- kept as a shared hook regardless, other callers
// still use it).

import React, { useMemo, useState } from "react";
import { useCompanyRoster } from "../hooks/useCompanyRoster";

export default function DriverPicker({
  companyId,
  excludeUserId,
  onlyUserIds,
  onPick,
  emptyLabel = "No drivers found.",
}: {
  companyId: string | null;
  excludeUserId?: string;
  onlyUserIds?: Set<string>; // limit the list (the dashboard's region filter)
  onPick: (userId: string, displayName: string) => void;
  emptyLabel?: string;
}) {
  const { members, loading } = useCompanyRoster(companyId, { excludeUserId });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = onlyUserIds ? members.filter((m) => onlyUserIds.has(m.user_id)) : members;
    if (!q) return base;
    return base.filter((m) => m.display_name.toLowerCase().includes(q));
  }, [members, search, onlyUserIds]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search drivers…"
        style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)", color: "white", fontSize: 14 }}
      />
      {loading && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "16px 0" }}>Loading…</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "16px 0" }}>{emptyLabel}</div>
      )}
      {!loading && filtered.map((m) => (
        <button
          key={m.user_id}
          type="button"
          onClick={() => onPick(m.user_id, m.display_name)}
          style={{
            width: "100%", textAlign: "left" as const, padding: "12px 14px", borderRadius: 2,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
            color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {m.display_name}
        </button>
      ))}
    </div>
  );
}
