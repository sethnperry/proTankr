"use client";
// app/planner/components/trip/DeliveryLocationsModal.tsx
//
// The Deliveries tool's window: every saved delivery location, tap one to set it up (name, store number,
// tanks, hose lengths) or add a new one. Shared by the Driver Dashboard and the Dispatch Dashboard
// tools grids, so a change here is a change in both.

import React, { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { LocationBrowser } from "./LocationPicker";
import type { DeliveryLocation, LatLon, LocationTank } from "@/lib/trips/deliveryLocations";
import type { ToolItem } from "@/app/planner/home/DashboardChrome";

/** Counties are looked up from each location's address, a few at a time, until none are left. Runs while the
 *  locations are being shown (the modal, or the Delivery Locations page). */
export function useCountySweep(active: boolean, locations: DeliveryLocation[], loading: boolean, reload: () => void | Promise<unknown>) {
  const sweeping = useRef(false);
  useEffect(() => {
    if (!active || sweeping.current || loading) return;
    if (!locations.some((l) => l.county == null)) return;
    sweeping.current = true;
    void (async () => {
      try {
        for (let i = 0; i < 40; i++) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) break;
          const res = await fetch("/api/locations/county-backfill", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) break;
          const j = (await res.json()) as { done: number; remaining: number };
          if (!j.done || !j.remaining) break;
        }
        await reload();
      } catch { /* try again next visit */ } finally { sweeping.current = false; }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, loading, locations.length]);
}

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
  useCountySweep(open, locations, false, onChanged);
  return (
    <FullscreenModal open={open} title="Delivery locations" onClose={onClose} footer={null}>
      {open && <LocationBrowser origin={origin} locations={locations} tanks={tanks} companyId={companyId} userId={userId} onChanged={onChanged} />}
    </FullscreenModal>
  );
}

/** The grid tile that opens it. Both dashboards put this in their tools grid. */
export const deliveriesTool = (onClick: () => void): ToolItem => ({ icon: "store", label: "Deliveries", sub: "Set up locations", onClick });
