"use client";
// app/planner/components/trip/DeliveryLocationsModal.tsx
//
// The Deliveries tool's window: every saved delivery location, tap one to set it up (name, store number,
// tanks, hose lengths) or add a new one. Shared by the Driver Dashboard and the Dispatch Dashboard
// tools grids, so a change here is a change in both.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { LocationBrowser } from "./LocationPicker";
import type { DeliveryLocation, LatLon, LocationTank } from "@/lib/trips/deliveryLocations";
import type { ToolItem } from "@/app/planner/home/DashboardChrome";

export function DeliveryLocationsModal({ open, onClose, locations, tanks, companyId, userId, origin = null, onChanged }: {
  open: boolean;
  onClose: () => void;
  locations: DeliveryLocation[];
  tanks: LocationTank[];
  companyId: string | null;
  userId: string | null;
  origin?: LatLon | null;
  onChanged: () => void;
}) {
  return (
    <FullscreenModal open={open} title="Delivery locations" onClose={onClose} footer={null}>
      {open && <LocationBrowser origin={origin} locations={locations} tanks={tanks} companyId={companyId} userId={userId} onChanged={onChanged} />}
    </FullscreenModal>
  );
}

/** The grid tile that opens it. Both dashboards put this in their tools grid. */
export const deliveriesTool = (onClick: () => void): ToolItem => ({ icon: "store", label: "Deliveries", sub: "Set up locations", onClick });
