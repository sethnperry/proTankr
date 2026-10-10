"use client";
// app/planner/components/trip/LocationPicker.tsx
//
// Delivery location picker (docs/trip-workflow-design.md §4): Near Me opens on
// everything within 150 air miles of the pickup terminal, starred locations
// always show, search by number, name or city. A place that isn't saved yet
// is added as a real location ("+ New location"), never typed as a one-off,
// so the company list stays clean.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import {
  NEAR_ME_MILES,
  filterLocations,
  locationPlace,
  locationTitle,
  type DeliveryLocation,
  type LatLon,
  type LocationTank,
} from "@/lib/trips/deliveryLocations";
import type { DeliveryDestination } from "@/lib/trips/tripFlow";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { dashedBtn, fieldInput, linkBtn, muted } from "./tripUi";
import { LocationEditor } from "./LocationEditor";

export function LocationPicker({
  open, title, origin, locations, tanks = [], companyId, userId, onToggleStar, onPick, onClose, onManage, onLocationAdded,
}: {
  open: boolean;
  title: string;
  origin: LatLon | null;
  locations: DeliveryLocation[];
  onToggleStar: (locationId: string, star: boolean) => void;
  onPick: (to: DeliveryDestination) => void;
  onClose: () => void;
  onManage?: () => void;
  tanks?: LocationTank[];
  companyId: string | null;
  userId: string | null;
  // Called after "+ New location" saves, so the caller can reload its list.
  onLocationAdded?: () => void;
}) {
  const [nearMe, setNearMe] = useState(true);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: products } = useProductsCatalog();

  // Each open starts on the list.
  useEffect(() => {
    if (open) setAdding(false);
  }, [open]);

  const pick = (l: DeliveryLocation) => onPick({ locationId: l.location_id, oneOffName: null, deliveryType: l.delivery_type });

  const list = useMemo(
    () => filterLocations(locations, { origin, nearMe: nearMe && !!origin, query }),
    [locations, origin, nearMe, query],
  );

  const toggle = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
    border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
    background: on ? "rgba(255,255,255,0.12)" : "transparent", color: on ? "#fff" : muted,
  });

  if (adding && companyId && userId) {
    return (
      <FullscreenModal open={open} title="New location" onClose={() => setAdding(false)} footer={null}>
        <button type="button" onClick={() => setAdding(false)} style={{ ...linkBtn, marginBottom: 12 }}>‹ Back to list</button>
        <LocationEditor
          companyId={companyId}
          userId={userId}
          location={null}
          tanks={tanks}
          existing={locations}
          products={products}
          seedName={query.trim()}
          onSaved={(l) => { onLocationAdded?.(); pick(l); }}
          onUseExisting={pick}
        />
      </FullscreenModal>
    );
  }

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button type="button" style={toggle(nearMe)} onClick={() => setNearMe(true)} disabled={!origin}>
          Near Me{origin ? "" : " (no terminal)"}
        </button>
        <button type="button" style={toggle(!nearMe || !origin)} onClick={() => setNearMe(false)}>All</button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, name or city"
        style={{ ...fieldInput, marginBottom: 10 }} />
      {nearMe && origin && (
        <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>
          Within {NEAR_ME_MILES} air miles of the pickup, plus your starred locations.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {list.length === 0 && (
          <div style={{ fontSize: 14, color: muted, padding: "12px 0" }}>
            {locations.length === 0 ? "No saved locations yet." : "No matches."}
          </div>
        )}
        {list.map((l) => (
          <div key={l.location_id} style={{
            display: "flex", alignItems: "center", gap: 8, borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
          }}>
            <button type="button" aria-label={l.starred ? "Unstar" : "Star"}
              onClick={() => onToggleStar(l.location_id, !l.starred)}
              style={{ border: "none", background: "transparent", color: l.starred ? "#fbbf24" : "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer", padding: "0 4px 0 10px" }}>
              {l.starred ? "★" : "☆"}
            </button>
            <button type="button"
              onClick={() => pick(l)}
              style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "#fff", padding: "12px 10px 12px 0", cursor: "pointer" }}>
              <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locationTitle(l)}</div>
              <div style={{ fontSize: 12, color: muted }}>
                {[locationPlace(l), l.delivery_type === "pump_off" ? "Pump off" : "Drop",
                  l.miles != null ? `${Math.round(l.miles)} mi` : null].filter(Boolean).join(" · ")}
              </div>
            </button>
          </div>
        ))}
      </div>

      {companyId && userId && (
        <button type="button" onClick={() => setAdding(true)} style={dashedBtn}>
          + New location{query.trim() ? ` “${query.trim()}”` : ""}
        </button>
      )}
      {onManage && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={onManage} style={linkBtn}>Manage saved locations ›</button>
        </div>
      )}
    </FullscreenModal>
  );
}
