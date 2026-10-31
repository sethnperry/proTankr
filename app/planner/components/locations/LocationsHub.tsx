"use client";
// app/planner/components/locations/LocationsHub.tsx
//
// The Locations tool, shared by the Driver and Dispatch dashboards. Tapping it asks what kind of location
// (Terminals, Deliveries; yards and maintenance facilities will be more rows here), then opens the shared
// modal for that kind. Terminals keep everything about one terminal together: training and the company letter,
// gauging time, racks and products, suppliers, and terminal cards. Dispatch, lead and admin get the editing parts; drivers see suppliers.

import React, { useState } from "react";
import { useCalculatorShell } from "../../CalculatorShellContext";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "@/app/planner/home/dashLook";
import { DeliveryHub } from "./DeliveryHub";
import type { ToolItem } from "@/app/planner/home/DashboardChrome";
import type { LatLon } from "@/lib/trips/deliveryLocations";

/** The grid tile. */
export const locationsTool = (onClick: () => void): ToolItem => ({ icon: "store", label: "Locations", sub: "Terminals & deliveries", onClick });

type Kind = "terminals" | "deliveries";
const KINDS: { kind: Kind; label: string; sub: string }[] = [
  { kind: "terminals", label: "Terminals", sub: "Training, gauging, racks, suppliers, cards" },
  { kind: "deliveries", label: "Deliveries", sub: "Stores and customer sites" },
];

export function LocationsHub(props: { open: boolean; onClose: () => void; companyId: string | null; userId: string | null; role: string | null; isSuperAdmin: boolean; origin?: LatLon | null }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const shell = useCalculatorShell();
  const close = () => { setKind(null); props.onClose(); };
  // Terminals is the shared Terminal screen: it opens on the selected terminal (or straight to search).
  const openTerminals = () => { setKind(null); props.onClose(); shell.setTerminalHubOpen(true); };
  const L = useDashLook();
  return (
    <>
      <FullscreenModal open={props.open && !kind} title="Locations" onClose={close} footer={null}>
        <div style={{ fontSize: 13, color: L.muted, marginBottom: 10 }}>What kind of location?</div>
        {KINDS.map((k) => (
          <button key={k.kind} type="button" className="dash-press" onClick={() => (k.kind === "terminals" ? openTerminals() : setKind(k.kind))}
            style={{ ...L.secondary, display: "block", width: "100%", textAlign: "left", color: "#fff", padding: "14px 14px", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{k.label} ›</div>
            <div style={{ fontSize: 12, color: L.muted, marginTop: 2 }}>{k.sub}</div>
          </button>
        ))}
      </FullscreenModal>
      {props.open && kind === "deliveries" && <DeliveriesBody {...props} onClose={() => setKind(null)} />}
    </>
  );
}

function DeliveriesBody({ onClose, companyId, userId, origin }: { onClose: () => void; companyId: string | null; userId: string | null; origin?: LatLon | null }) {
  return <DeliveryHub open onClose={onClose} companyId={companyId} userId={userId} origin={origin} />;
}
