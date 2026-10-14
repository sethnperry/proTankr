"use client";
// app/planner/components/trip/LocationPicker.tsx
//
// Delivery location picker. Laid out like the terminal picker
// (MyTerminalsModal): the city at the top with Change, then one card per
// location. Starred locations in that city come first (store number, then
// name); "Show N more" reveals the rest of the city. Change opens a city list
// with a search that also finds locations directly. A place that isn't saved
// yet is added as a real location ("+ New location"), never a one-off.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import {
  defaultLocationCity,
  filterLocations,
  locationCities,
  locationsInCity,
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
  selectedLocationId = null,
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
  // Highlighted, and its city is where the picker opens.
  selectedLocationId?: string | null;
}) {
  const [cityKey, setCityKey] = useState<string | null>(null);
  const [choosingCity, setChoosingCity] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const { data: products } = useProductsCatalog();

  // Each open starts on the list, in the selected location's city.
  useEffect(() => {
    if (!open) return;
    setAdding(false);
    setChoosingCity(false);
    setShowAll(false);
    setQuery("");
    setCityKey(defaultLocationCity(locations, { selectedId: selectedLocationId, origin }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A brand-new list (first load) with no city picked yet.
  useEffect(() => {
    if (open && !cityKey && locations.length) setCityKey(defaultLocationCity(locations, { selectedId: selectedLocationId, origin }));
  }, [open, cityKey, locations, selectedLocationId, origin]);

  const pick = (l: DeliveryLocation) => onPick({ locationId: l.location_id, oneOffName: null, deliveryType: l.delivery_type });

  const cities = useMemo(() => locationCities(locations), [locations]);
  const city = cities.find((c) => c.key === cityKey) ?? null;
  const groups = useMemo(() => (cityKey ? locationsInCity(locations, cityKey) : { starred: [], others: [] }), [locations, cityKey]);
  const matches = useMemo(
    () => (query.trim() ? filterLocations(locations, { origin: null, nearMe: false, query }) : []),
    [locations, query],
  );
  const cityLabel = (c: { city: string; state: string } | null) =>
    c ? (c.city ? [c.city, c.state].filter(Boolean).join(", ") : "No city") : "";

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

  const card = (l: DeliveryLocation) => {
    const active = l.location_id === selectedLocationId;
    return (
      <div key={l.location_id} style={{
        display: "flex", alignItems: "center", borderRadius: 6, overflow: "hidden",
        border: `1px solid ${active ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
        background: active ? "rgba(255,255,255,0.05)" : "transparent",
      }}>
        <button type="button" aria-label={l.starred ? "Unstar" : "Star"}
          onClick={() => onToggleStar(l.location_id, !l.starred)}
          style={{ flexShrink: 0, width: 26, height: 26, marginLeft: 12, padding: 0, border: "none", background: "transparent",
            color: l.starred ? "#fbbf24" : "rgba(255,255,255,0.3)", fontSize: 20, lineHeight: "26px", cursor: "pointer" }}>
          {l.starred ? "★" : "☆"}
        </button>
        <button type="button" onClick={() => pick(l)}
          style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "#fff", padding: "8px 12px", cursor: "pointer" }}>
          <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locationTitle(l)}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[l.address, l.delivery_type === "pump_off" ? "Pump off" : "Drop"].filter(Boolean).join(" · ")}
          </div>
        </button>
      </div>
    );
  };

  const footer = (
    <>
      {companyId && userId && (
        <button type="button" onClick={() => setAdding(true)} style={{ ...dashedBtn, marginTop: 14 }}>
          + New location{query.trim() ? ` “${query.trim()}”` : ""}
        </button>
      )}
      {onManage && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={onManage} style={linkBtn}>Manage saved locations ›</button>
        </div>
      )}
    </>
  );

  // City list (Change), with a search that finds locations in any city.
  if (choosingCity || (!city && locations.length > 0)) {
    return (
      <FullscreenModal open={open} title="Choose a city" onClose={onClose} footer={null}>
        {city && (
          <button type="button" onClick={() => { setChoosingCity(false); setQuery(""); }} style={{ ...linkBtn, marginBottom: 12 }}>‹ Back to {cityLabel(city)}</button>
        )}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, name or city"
          style={{ ...fieldInput, marginBottom: 10 }} />
        {query.trim() ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {matches.length === 0 && <div style={{ fontSize: 14, color: muted, padding: "12px 0" }}>No matches.</div>}
            {matches.map((l) => card(l))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cities.map((c) => (
              <button key={c.key} type="button"
                onClick={() => { setCityKey(c.key); setChoosingCity(false); setShowAll(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px", borderRadius: 6, cursor: "pointer", textAlign: "left",
                  border: `1px solid ${c.key === cityKey ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}`,
                  background: c.key === cityKey ? "rgba(255,255,255,0.05)" : "transparent", color: "#fff" }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{cityLabel(c)}</span>
                <span style={{ fontSize: 12, color: muted }}>{c.count} location{c.count === 1 ? "" : "s"}</span>
              </button>
            ))}
          </div>
        )}
        {footer}
      </FullscreenModal>
    );
  }

  const hidden = groups.others.length;
  const shown = groups.starred.length === 0 || showAll ? [...groups.starred, ...groups.others] : groups.starred;

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      {locations.length === 0 ? (
        <div style={{ fontSize: 14, color: muted, padding: "12px 0" }}>No saved locations yet.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>
            <span>Showing locations in <span style={{ color: "#fff" }}>{cityLabel(city)}</span></span>
            <button type="button" onClick={() => { setChoosingCity(true); setQuery(""); }}
              style={{ flexShrink: 0, border: "none", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
              Change
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((l) => card(l))}
          </div>
          {groups.starred.length > 0 && hidden > 0 && (
            <button type="button" onClick={() => setShowAll((v) => !v)}
              style={{ width: "100%", marginTop: 10, padding: "10px 0", border: "none", borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {showAll ? "Hide unstarred ▲" : `Show ${hidden} more in ${city?.city || "this city"} ▼`}
            </button>
          )}
        </>
      )}
      {footer}
    </FullscreenModal>
  );
}
