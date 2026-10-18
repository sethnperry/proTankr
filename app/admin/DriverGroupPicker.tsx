"use client";
// app/admin/DriverGroupPicker.tsx
//
// Region-grouped driver checkbox filter, shared by PayrollReportModal.tsx
// (Period Report) and FleetUtilizationModal.tsx -- per explicit user
// request ("should it be by region then just check all the drivers to
// include?"). Built once, shared, rather than copied into both modals --
// same reasoning this codebase already documents elsewhere for shared UI
// pieces (CustomSelect.tsx, ServiceTypeManager.tsx).
//
// Selection model: `null` means "everyone" (no filter) -- the default,
// common case. Once the admin unchecks anyone, the caller holds an
// explicit `Set<string>` of included driver_ids going forward. This
// picker only ever offers CURRENT company members (via useCompanyRoster,
// which already reflects live user_companies membership) -- a driver
// removed from the company simply doesn't appear here to pick, matching
// the same "hide departed drivers" decision applied to the reports
// themselves.

import React, { useMemo, useState } from "react";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

const NO_REGION = "No Region";

export default function DriverGroupPicker({
  open,
  onClose,
  companyId,
  selectedIds,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  selectedIds: Set<string> | null;
  onChange: (ids: Set<string> | null) => void;
}) {
  const { members, loading } = useCompanyRoster(companyId);
  // Local draft so region/all toggles feel instant without round-tripping
  // through the parent on every tap; committed via onChange on Done/close.
  const [draft, setDraft] = useState<Set<string> | null>(selectedIds);
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Reset the draft to the caller's current selection each time the
  // picker opens (not on every render) -- lets Done vs. backdrop-dismiss
  // both behave predictably without a separate cancel button.
  if (open && openedFor !== companyId) {
    setOpenedFor(companyId);
    setDraft(selectedIds);
  }

  const isSelected = (id: string) => draft === null || draft.has(id);

  const groups = useMemo(() => {
    const map = new Map<string, typeof members>();
    for (const m of members) {
      const key = m.region?.trim() || NO_REGION;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    const order = Array.from(map.keys()).sort((a, b) => {
      if (a === NO_REGION) return 1;
      if (b === NO_REGION) return -1;
      return a.localeCompare(b);
    });
    return order.map((region) => ({ region, drivers: map.get(region)! }));
  }, [members]);

  function toggleDriver(id: string) {
    setDraft((prev) => {
      const base = prev === null ? new Set(members.map((m) => m.user_id)) : new Set(prev);
      if (base.has(id)) base.delete(id); else base.add(id);
      return base.size === members.length ? null : base;
    });
  }

  function toggleRegion(regionDrivers: typeof members) {
    const allSelected = regionDrivers.every((m) => isSelected(m.user_id));
    setDraft((prev) => {
      const base = prev === null ? new Set(members.map((m) => m.user_id)) : new Set(prev);
      for (const m of regionDrivers) {
        if (allSelected) base.delete(m.user_id); else base.add(m.user_id);
      }
      return base.size === members.length ? null : base;
    });
  }

  function selectAll() { setDraft(null); }
  function selectNone() { setDraft(new Set()); }

  function commit() {
    onChange(draft);
    onClose();
  }

  const selectedCount = draft === null ? members.length : draft.size;

  return (
    <FullscreenModal
      open={open}
      title="Filter Drivers"
      onClose={commit}
      footer={
        <button
          onClick={commit}
          className="w-full rounded-[2px] bg-[#111] px-4 py-3 font-semibold text-white border border-white/15 hover:bg-[#151515]"
        >
          Done — {selectedCount} of {members.length} included
        </button>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={selectAll} style={pillStyle}>Select All</button>
          <button type="button" onClick={selectNone} style={pillStyle}>Select None</button>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "24px 0" }}>Loading…</div>
        ) : members.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" as const, padding: "24px 0" }}>No drivers found.</div>
        ) : (
          groups.map(({ region, drivers }) => {
            const allChecked = drivers.every((m) => isSelected(m.user_id));
            const someChecked = !allChecked && drivers.some((m) => isSelected(m.user_id));
            return (
              <div key={region} style={{ display: "grid", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => toggleRegion(drivers)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 2,
                    border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", cursor: "pointer", width: "100%", textAlign: "left" as const,
                  }}
                >
                  <Checkbox checked={allChecked} indeterminate={someChecked} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" as const, letterSpacing: 0.5, flex: 1 }}>
                    {region}
                  </span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{drivers.length}</span>
                </button>
                {drivers.map((m) => (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleDriver(m.user_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "9px 12px 9px 24px", borderRadius: 2,
                      border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", cursor: "pointer", width: "100%", textAlign: "left" as const,
                    }}
                  >
                    <Checkbox checked={isSelected(m.user_id)} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{m.display_name}</span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </FullscreenModal>
  );
}

function Checkbox({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 2, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${checked || indeterminate ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"}`,
      background: checked ? "rgba(255,255,255,0.85)" : "transparent",
    }}>
      {checked && <span style={{ width: 10, height: 10, borderRadius: 2, background: "#111" }} />}
      {indeterminate && !checked && <span style={{ width: 8, height: 2, background: "rgba(255,255,255,0.6)" }} />}
    </span>
  );
}

const pillStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 700, cursor: "pointer",
};
