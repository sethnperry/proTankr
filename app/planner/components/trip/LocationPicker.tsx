"use client";
// app/planner/components/trip/LocationPicker.tsx
//
// The one delivery-location list. Used to pick a delivery (the left three quarters of a card selects it)
// and, with no onPick (the Delivery Locations page), to manage them (the whole card opens it). The right
// quarter of every card opens the editor. "Showing Tampa, FL · Change" narrows State > County > City,
// the search box finds a store by number, name or city anywhere, and "+ New location" adds one.

import React, { useEffect, useMemo, useState } from "react";
import { AreaChooser } from "./AreaChooser";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import {
  byNumberThenName,
  defaultLocationCity,
  filterLocations,
  locationTitle,
  type DeliveryLocation,
  type LatLon,
  type LocationTank,
} from "@/lib/trips/deliveryLocations";
import { areaLabel, inArea, type AreaPick } from "@/lib/trips/areaTree";
import type { DeliveryDestination } from "@/lib/trips/tripFlow";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { linkBtn } from "./tripUi";
import { CAPS, FIELD, HAIR, MUTE, PANEL } from "./deliveryUi";
import { LocationEditor } from "./LocationEditor";

const PAGE = 60;

export function LocationBrowser({
  origin = null, locations, tanks = [], companyId, userId, onPick, onChanged, selectedLocationId = null,
}: {
  origin?: LatLon | null;
  locations: DeliveryLocation[];
  tanks?: LocationTank[];
  companyId: string | null;
  userId: string | null;
  /** Select a delivery. Without it (the manage page) the whole card opens the editor. */
  onPick?: (to: DeliveryDestination) => void;
  /** After a location is added, edited or retired, so the caller can reload its list. */
  onChanged?: () => void;
  selectedLocationId?: string | null;
}) {
  const [area, setArea] = useState<AreaPick | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  // undefined = the list; null = a new location; a row = editing it.
  const [editing, setEditing] = useState<DeliveryLocation | null | undefined>(undefined);
  const { data: products } = useProductsCatalog();

  // Open on the selected delivery's city, else the one nearest the pickup, else the first.
  useEffect(() => {
    if (area || locations.length === 0) return;
    const key = defaultLocationCity(locations, { selectedId: selectedLocationId, origin });
    const l = key ? locations.find((x) => `${(x.city ?? "").trim().toLowerCase()}|${(x.state ?? "").trim().toUpperCase()}` === key) : null;
    setArea(l ? { state: (l.state ?? "").trim().toUpperCase(), county: "", city: (l.city ?? "").trim() } : { state: "", county: "", city: "" });
  }, [area, locations, selectedLocationId, origin]);

  const searching = !!query.trim();
  const list = useMemo(() => {
    const base = searching ? filterLocations(locations, { origin: null, nearMe: false, query }) : inArea(locations, area ?? { state: "", county: "", city: "" });
    return [...base].sort(byNumberThenName);
  }, [locations, area, query, searching]);

  const pick = (l: DeliveryLocation) => onPick?.({ locationId: l.location_id, oneOffName: null, deliveryType: l.delivery_type });
  const done = () => { onChanged?.(); setEditing(undefined); };

  if (editing !== undefined && companyId && userId) {
    return (
      <>
        <button type="button" onClick={() => setEditing(undefined)} style={{ ...linkBtn, marginBottom: 12 }}>‹ Back to list</button>
        <LocationEditor
          key={editing?.location_id ?? "new"}
          companyId={companyId}
          userId={userId}
          location={editing}
          tanks={tanks}
          existing={locations}
          products={products}
          seedName={editing ? "" : query.trim()}
          onSaved={(l) => { onChanged?.(); if (!editing && onPick) pick(l); else setEditing(undefined); }}
          onUseExisting={(l) => (onPick && !editing ? pick(l) : setEditing(l))}
          onRetired={done}
        />
      </>
    );
  }

  const card = (l: DeliveryLocation) => {
    const active = l.location_id === selectedLocationId;
    return (
      <div key={l.location_id} style={{ display: "flex", alignItems: "stretch", borderTop: `1px solid ${HAIR}`, background: "#0f0f10" }}>
        <span aria-hidden style={{ width: 4, background: active ? "#fff" : "transparent", flexShrink: 0 }} />
        <button type="button" onClick={() => (onPick ? pick(l) : setEditing(l))}
          style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "#fff", padding: "12px 12px", cursor: "pointer" }}>
          <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locationTitle(l)}</div>
          <div style={{ marginTop: 3, fontSize: 12, color: MUTE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[searching ? [l.city, l.state].filter(Boolean).join(", ") : null, l.address, l.delivery_type === "pump_off" ? "Pump off" : "Drop"].filter(Boolean).join(" · ")}
          </div>
        </button>
        <button type="button" aria-label={`Edit ${locationTitle(l)}`} onClick={() => setEditing(l)}
          style={{ width: 64, border: "none", borderLeft: `1px solid ${HAIR}`, background: "transparent", color: MUTE, ...CAPS, cursor: "pointer" }}>
          Edit ›
        </button>
      </div>
    );
  };

  return (
    <>
      <AreaChooser userId={userId} open={areaOpen} locations={locations} value={area ?? { state: "", county: "", city: "" }}
        onPick={(p) => { setArea(p); setLimit(PAGE); setQuery(""); }} onClose={() => setAreaOpen(false)} />
      {locations.length === 0 ? (
        <div style={{ ...PANEL, fontSize: 14, color: MUTE, padding: 14 }}>No saved locations yet.</div>
      ) : (
        <>
          <div style={{ ...PANEL, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={CAPS}>{searching ? "Search results" : "Showing"}</div>
              {!searching && <div style={{ marginTop: 3, fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{areaLabel(area ?? { state: "", county: "", city: "" })}</div>}
            </div>
            <button type="button" onClick={() => setAreaOpen(true)}
              style={{ flexShrink: 0, padding: "8px 14px", border: `1px solid ${HAIR}`, background: "#050505", color: "#fff", ...CAPS, letterSpacing: "0.1em", cursor: "pointer" }}>
              Change
            </button>
          </div>
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Search number, name or city"
            style={{ ...FIELD, marginBottom: 10 }} />
          <div style={{ ...PANEL, display: "flex", flexDirection: "column" }}>
            {list.length === 0 && <div style={{ fontSize: 14, color: MUTE, padding: 14 }}>{searching ? "No matches." : "No locations here."}</div>}
            {list.slice(0, limit).map(card)}
          </div>
          {list.length > limit && (
            <button type="button" onClick={() => setLimit((n) => n + PAGE)}
              style={{ width: "100%", marginTop: 8, padding: "12px 0", border: `1px solid ${HAIR}`, background: "#0f0f10", color: MUTE, ...CAPS, cursor: "pointer" }}>
              Show {Math.min(PAGE, list.length - limit)} more ▼
            </button>
          )}
        </>
      )}
      {companyId && userId && (
        <button type="button" onClick={() => setEditing(null)}
          style={{ width: "100%", marginTop: 12, padding: "14px 0", border: `1px solid ${HAIR}`, background: "#050505", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
          + New location{query.trim() ? ` “${query.trim()}”` : ""}
        </button>
      )}
    </>
  );
}

export function LocationPicker({
  open, title, origin = null, locations, tanks = [], companyId, userId, onPick, onClose, onLocationAdded, selectedLocationId = null,
}: {
  open: boolean;
  title: string;
  origin?: LatLon | null;
  locations: DeliveryLocation[];
  onPick: (to: DeliveryDestination) => void;
  onClose: () => void;
  tanks?: LocationTank[];
  companyId: string | null;
  userId: string | null;
  // Called after a location is added, edited or retired, so the caller can reload its list.
  onLocationAdded?: () => void;
  selectedLocationId?: string | null;
}) {
  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      {open && (
        <LocationBrowser origin={origin} locations={locations} tanks={tanks} companyId={companyId} userId={userId}
          onPick={onPick} onChanged={onLocationAdded} selectedLocationId={selectedLocationId} />
      )}
    </FullscreenModal>
  );
}
