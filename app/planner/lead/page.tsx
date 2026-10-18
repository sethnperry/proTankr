"use client";
// app/planner/lead/page.tsx
//
// New role-specific tab, shown to the left of Planner for lead-role users
// (see CalculatorLayoutClient.tsx's ROLE_TABS). Deliberately a fresh,
// focused layout rather than a literal copy of the Planner page's
// load-planning shell (equipment/location cards, temp dial, Load button) --
// those don't have an obvious meaning for a fleet-monitoring dashboard, and
// dragging in that machinery just to get "visual consistency" would mean
// inventing meaning for controls that don't do anything real yet. Dispatch
// and Admin tabs will likely follow this same shape: subtabs + a
// role-relevant chart/content area.
//
// Subtabs mirror the Planner's A-E preset row's "selected item centers
// itself" mechanic via the new shared CenteredSubTabs component. Only
// Dashboard has real content right now -- Tasks and Ledger are honest
// placeholders, not a guess at unspecified functionality.
//
// Equipment button/modal is a real exception to "fresh, focused, not a
// literal copy" above -- it's the exact same Equipment sheet the Planner
// uses (shell.equipOpen/setEquipOpen, already mounted once in
// CalculatorLayoutClient's ShellChrome and shared via CalculatorShellContext,
// same as the Cards/Vault tabs already reuse it). Only the *result* of
// picking equipment differs: Planner reveals the compartment/load-planning
// UI, this reveals the driver schedule chart for that equipment instead.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import CenteredSubTabs, { type CenteredSubTab } from "../components/CenteredSubTabs";
import EquipmentScheduleChart from "./EquipmentScheduleChart";
import DriverAssignmentModal from "./DriverAssignmentModal";

const SUBTABS: CenteredSubTab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tasks", label: "Tasks" },
  { id: "ledger", label: "Ledger" },
];

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", padding: "28px 18px", textAlign: "center" as const }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>{note}</div>
    </div>
  );
}

const infoCard: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(255,255,255,0.03)", padding: "10px 14px",
};
const chevron: React.CSSProperties = { fontSize: 16, color: "rgba(255,255,255,0.25)", flexShrink: 0 };

export default function LeadPage() {
  const shell = useCalculatorShell();
  const [activeSubTab, setActiveSubTab] = useState("dashboard");
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  // Driver assignment (who's on day shift / night shift for the selected
  // equipment) has no backing table yet -- same "mock data first" call
  // already made for the schedule chart itself. Lifted here (rather than
  // living inside the chart) so DriverAssignmentModal can update it.
  const [dayDriverName, setDayDriverName] = useState("Pedro Guzman");
  const [nightDriverName, setNightDriverName] = useState("Seth Perry");

  // Equipment details (truck/trailer name + make) -- same fetch shape as
  // the Planner's own equipmentDetails (app/planner/page.tsx), kept
  // local here since it's Planner-specific state, not hoisted to the
  // shared shell context.
  const [equipmentDetails, setEquipmentDetails] = useState({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
  const selectedTruckId = shell.equipment.selectedCombo?.truck_id ?? null;
  const selectedTrailerId = shell.equipment.selectedCombo?.trailer_id ?? null;

  useEffect(() => {
    (async () => {
      if (!selectedTruckId && !selectedTrailerId) {
        setEquipmentDetails({ truckName: "", truckMake: "", trailerName: "", trailerMake: "" });
        return;
      }
      const [truckRes, trailerRes] = await Promise.all([
        selectedTruckId ? supabase.from("trucks").select("truck_name, make").eq("truck_id", selectedTruckId).maybeSingle() : Promise.resolve({ data: null }),
        selectedTrailerId ? supabase.from("trailers").select("trailer_name, make").eq("trailer_id", selectedTrailerId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setEquipmentDetails({
        truckName: (truckRes as any)?.data?.truck_name ?? "",
        truckMake: (truckRes as any)?.data?.make ?? "",
        trailerName: (trailerRes as any)?.data?.trailer_name ?? "",
        trailerMake: (trailerRes as any)?.data?.make ?? "",
      });
    })();
  }, [selectedTruckId, selectedTrailerId]);

  const hasEquipment = Boolean(shell.equipment.selectedCombo);

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ marginBottom: 14 }}>
        <CenteredSubTabs tabs={SUBTABS} activeId={activeSubTab} onChange={setActiveSubTab} />
      </div>

      {activeSubTab === "dashboard" && (
        hasEquipment ? (
          <EquipmentScheduleChart
            equipmentLabel={
              <>
                <span>Truck · {equipmentDetails.truckName || "—"}</span>
                <span>Trailer · {equipmentDetails.trailerName || "—"}</span>
              </>
            }
            dayDriverName={dayDriverName}
            nightDriverName={nightDriverName}
          />
        ) : (
          <PlaceholderPanel
            title="No equipment selected"
            note="Select equipment above to see its driver schedule."
          />
        )
      )}

      {activeSubTab === "tasks" && (
        <PlaceholderPanel
          title="Tasks"
          note="Coming soon -- likely fleet-wide training checklist progress and other pending items that need a lead's attention."
        />
      )}

      {activeSubTab === "ledger" && (
        <PlaceholderPanel
          title="Ledger"
          note="Coming soon -- likely an equipment activity or incentive-points log, scoped once the exact content is defined."
        />
      )}

      {/* Buttons sit below the chart area, matching the Planner's own
          layout order (compartment display on top, info cards/buttons
          below it). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {/* Equipment card -- exact same sheet the Planner uses, via the shared shell context */}
        <button
          type="button"
          onClick={() => shell.setEquipOpen(true)}
          style={{ ...infoCard, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer", textAlign: "left" as const }}
        >
          {!hasEquipment ? (
            <>
              <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>Select Equipment</span>
              <span style={chevron}>›</span>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flex: 1, gap: 20, minWidth: 0 }}>
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    Truck{equipmentDetails.truckName ? ` · ${equipmentDetails.truckName}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {equipmentDetails.truckMake || " "}
                  </div>
                </div>
                <div style={{ minWidth: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    Trailer{equipmentDetails.trailerName ? ` · ${equipmentDetails.trailerName}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {equipmentDetails.trailerMake || " "}
                  </div>
                </div>
              </div>
              <span style={chevron}>›</span>
            </>
          )}
        </button>

        {/* Driver assignment -- new, Lead-tab-only. No backing table yet
            (same as the schedule chart itself); assignment lives in this
            page's own state and feeds the chart above. */}
        <button
          type="button"
          onClick={() => setAssignModalOpen(true)}
          disabled={!hasEquipment}
          style={{ ...infoCard, width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: hasEquipment ? "pointer" : "not-allowed", opacity: hasEquipment ? 1 : 0.5, textAlign: "left" as const }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: hasEquipment ? "#fff" : "rgba(255,255,255,0.35)" }}>
            Driver Assignment
          </span>
          <span style={chevron}>›</span>
        </button>
      </div>

      <DriverAssignmentModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        companyId={shell.companyId}
        dayDriverName={dayDriverName}
        nightDriverName={nightDriverName}
        onAssign={(day, night) => { setDayDriverName(day); setNightDriverName(night); }}
      />
    </div>
  );
}
